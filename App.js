import './src/backgroundTask';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as KeepAwake from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { WebView } from 'react-native-webview';
import { registerBackgroundTask } from './src/backgroundTask';
import { NATIVE_KEYS } from './src/constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const BRIDGE_SCRIPT = `
(function(){
  if (window.__CYCLE_NATIVE_BRIDGE__) return true;
  window.__CYCLE_NATIVE_BRIDGE__ = true;
  function parse(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || fallback); } catch(e){ return JSON.parse(fallback); } }
  function sync(){
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'cycle-state',
        watchlist:parse('cyc_v5_watchlist_v1','[]'),
        systemRunning:localStorage.getItem('cyc_v5_system_running_v1') !== '0',
        wakeDesired:localStorage.getItem('cyc_v5_wake_lock_v1') === '1',
        at:Date.now()
      }));
    } catch(e){}
  }
  var oldSet = localStorage.setItem.bind(localStorage);
  var oldRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function(k,v){ oldSet(k,v); if(/^cyc_v5_/.test(k)) setTimeout(sync,0); };
  localStorage.removeItem = function(k){ oldRemove(k); if(/^cyc_v5_/.test(k)) setTimeout(sync,0); };
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) sync(); });
  window.addEventListener('focus', sync);
  setInterval(sync, 15000);
  setTimeout(sync, 500);
  true;
})();
`;

export default function App() {
  const webRef = useRef(null);
  const [webReady, setWebReady] = useState(false);
  const appState = useRef(AppState.currentState);

  const applyWake = useCallback(async (desired) => {
    try {
      if (desired) await KeepAwake.activateKeepAwakeAsync('cycle-tracker');
      else await KeepAwake.deactivateKeepAwake('cycle-tracker');
    } catch (_) {}
  }, []);

  const requestNotifications = useCallback(async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status !== 'granted') await Notifications.requestPermissionsAsync();
    } catch (_) {}
  }, []);

  const syncNativeEventsIntoWeb = useCallback(async () => {
    if (!webReady || !webRef.current) return;
    const raw = await AsyncStorage.getItem(NATIVE_KEYS.backgroundEvents);
    if (!raw) return;
    let events;
    try { events = JSON.parse(raw); } catch (_) { events = []; }
    if (!events.length) return;
    const payload = JSON.stringify(events).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const js = `
      (function(){
        try {
          var events=JSON.parse('${payload}');
          var wl=JSON.parse(localStorage.getItem('cyc_v5_watchlist_v1')||'[]');
          var changed=false;
          events.slice().reverse().forEach(function(ev){
            var item=wl.find(function(x){return x.symbol===ev.symbol});
            if(!item) return;
            item.events=item.events||[];
            if(!item.events.some(function(x){return x.nativeEventId===ev.id})){
              item.events.unshift({t:ev.t||Date.now(),text:'📱 BG • '+ev.text,nativeEventId:ev.id});
              changed=true;
            }
          });
          if(changed) localStorage.setItem('cyc_v5_watchlist_v1',JSON.stringify(wl));
          if(typeof renderWatchlist==='function') renderWatchlist();
        }catch(e){}
        true;
      })();
    `;
    webRef.current.injectJavaScript(js);
  }, [webReady]);

  useEffect(() => {
    registerBackgroundTask().catch(() => {});
    requestNotifications();
    const sub = AppState.addEventListener('change', next => {
      const wasBg = /inactive|background/.test(appState.current);
      appState.current = next;
      if (wasBg && next === 'active') syncNativeEventsIntoWeb();
    });
    return () => sub.remove();
  }, [requestNotifications, syncNativeEventsIntoWeb]);

  useEffect(() => { if (webReady) syncNativeEventsIntoWeb(); }, [webReady, syncNativeEventsIntoWeb]);

  const onMessage = useCallback(async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'cycle-state') return;
      await AsyncStorage.multiSet([
        [NATIVE_KEYS.watchlist, JSON.stringify(Array.isArray(msg.watchlist) ? msg.watchlist : [])],
        [NATIVE_KEYS.systemRunning, msg.systemRunning ? '1' : '0'],
        [NATIVE_KEYS.wakeDesired, msg.wakeDesired ? '1' : '0'],
      ]);
      await applyWake(!!msg.wakeDesired);
    } catch (_) {}
  }, [applyWake]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#071019" />
      <View style={styles.webWrap}>
        <WebView
          ref={webRef}
          source={require('./assets/tracker.html')}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          injectedJavaScriptBeforeContentLoaded={BRIDGE_SCRIPT}
          onMessage={onMessage}
          onLoadEnd={() => setWebReady(true)}
          style={styles.web}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          bounces={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{ flex:1, backgroundColor:'#071019' },
  webWrap:{ flex:1, backgroundColor:'#071019' },
  web:{ flex:1, backgroundColor:'#071019' },
});
