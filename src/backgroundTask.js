import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { BACKGROUND_TASK_NAME, HIGHER_EXIT_IDS, NATIVE_KEYS } from './constants';
import { fetchFrames, higherFrameExit, pendingFiveMinuteReversal } from './cycleEngine';

const FRAME_IDS = ['5m', ...HIGHER_EXIT_IDS];

async function appendBackgroundEvent(event) {
  const raw = await AsyncStorage.getItem(NATIVE_KEYS.backgroundEvents);
  const list = raw ? JSON.parse(raw) : [];
  list.unshift(event);
  if (list.length > 200) list.length = 200;
  await AsyncStorage.setItem(NATIVE_KEYS.backgroundEvents, JSON.stringify(list));
}

async function notify(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
  } catch (_) {}
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const running = await AsyncStorage.getItem(NATIVE_KEYS.systemRunning);
    if (running === '0') return BackgroundTask.BackgroundTaskResult.Success;

    const raw = await AsyncStorage.getItem(NATIVE_KEYS.watchlist);
    const watchlist = raw ? JSON.parse(raw) : [];
    const active = watchlist.filter(x => x?.symbol && (x.trade || x.pendingEntry));
    const snapshot = { ranAt:Date.now(), checked:0, events:0, errors:0 };

    for (const item of active.slice(0, 20)) {
      try {
        const frames = await fetchFrames(item.symbol, FRAME_IDS);
        snapshot.checked++;

        if (item.trade) {
          const exit = higherFrameExit(frames, item.trade);
          if (exit) {
            const event = {
              id:`${item.symbol}:exit:${exit.id}:${exit.point.ct}`,
              t:Date.now(), symbol:item.symbol, type:'higher-exit', frame:exit.id,
              text:`${exit.id.toUpperCase()} closed CYC ${exit.point.dir.toUpperCase()} opposite — early exit condition`,
            };
            await appendBackgroundEvent(event);
            await notify(`${item.symbol.replace('USDT','')} • Early Exit`, event.text, event);
            snapshot.events++;
          }
        } else if (item.pendingEntry) {
          const reversal = pendingFiveMinuteReversal(frames['5m'], item.pendingEntry);
          if (reversal) {
            const event = {
              id:`${item.symbol}:pending-cancel:${frames['5m']?.current?.ct || Date.now()}`,
              t:Date.now(), symbol:item.symbol, type:'pending-invalid',
              text:`Pending entry invalidated: ${reversal.reason}`,
            };
            await appendBackgroundEvent(event);
            await notify(`${item.symbol.replace('USDT','')} • Entry invalid`, event.text, event);
            snapshot.events++;
          }
        }
      } catch (_) {
        snapshot.errors++;
      }
    }

    await AsyncStorage.setItem(NATIVE_KEYS.backgroundState, JSON.stringify(snapshot));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    await AsyncStorage.setItem(NATIVE_KEYS.backgroundState, JSON.stringify({ ranAt:Date.now(), error:String(error) }));
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask() {
  const available = await TaskManager.isAvailableAsync();
  if (!available) return { available:false, registered:false };
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, { minimumInterval:15 });
  }
  return { available:true, registered:true };
}
