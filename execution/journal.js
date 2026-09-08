'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fault = code => Object.assign(new Error(code), {code});

// Single writer, append-only, fsync before acknowledgement. A batch is one commit.
// A trailing incomplete batch is discarded; corruption inside a committed batch
// is fatal. Restart always requires reconciliation and explicit Paper resume.
class Journal {
  constructor(directory, apply) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    this.file = path.join(directory,'execution-events.jsonl');
    this.lock = path.join(directory,'writer.lock');
    this.sequence = 0;
    this.hash = 'GENESIS';
    this.closed = false;
    this.owner = crypto.randomUUID();
    try {
      const fd = fs.openSync(this.lock,'wx',0o600);
      fs.writeFileSync(fd,JSON.stringify({pid:process.pid,owner:this.owner})); fs.fsyncSync(fd); fs.closeSync(fd);
    } catch(e) {
      if(e.code !== 'EEXIST') throw e;
      let previous;
      try { previous = JSON.parse(fs.readFileSync(this.lock,'utf8')); } catch { throw fault('WRITER_LOCK_INVALID'); }
      if(!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw fault('WRITER_LOCK_INVALID');
      let dead = false;
      try { process.kill(previous.pid,0); } catch(k) { if(k.code === 'ESRCH') dead = true; }
      if(!dead) throw fault('EXECUTION_SINGLE_WRITER_REQUIRED');
      fs.unlinkSync(this.lock);
      const fd = fs.openSync(this.lock,'wx',0o600);
      fs.writeFileSync(fd,JSON.stringify({pid:process.pid,owner:this.owner})); fs.fsyncSync(fd); fs.closeSync(fd);
    }
    try {
      this.fd = fs.openSync(this.file,'a+',0o600);
      this.bytes = fs.fstatSync(this.fd).size;
      if(this.bytes > 256*1024*1024) throw fault('EXECUTION_JOURNAL_CAPACITY');
      let buffer = Buffer.alloc(65536), pending = Buffer.alloc(0), offset = 0, committed = 0, n;
      while((n=fs.readSync(this.fd,buffer,0,buffer.length,offset)) > 0) {
        offset += n; pending = Buffer.concat([pending,buffer.subarray(0,n)]);
        let end;
        while((end=pending.indexOf(10)) >= 0) {
          if(end > 262144) throw fault('JOURNAL_RECORD_TOO_LARGE');
          const line = pending.subarray(0,end).toString('utf8');
          let row;
          try { row=JSON.parse(line); } catch { throw fault('JOURNAL_CORRUPT'); }
          const {hash,...record} = row;
          if(record.sequence !== this.sequence+1 || record.previous !== this.hash || digest(record) !== hash || !Array.isArray(record.events)) throw fault('JOURNAL_CORRUPT');
          apply(record.events);
          this.sequence = record.sequence; this.hash = hash;
          committed += end+1; pending = pending.subarray(end+1);
        }
        if(pending.length > 262144) throw fault('JOURNAL_RECORD_TOO_LARGE');
      }
      this.tornTail = pending.length > 0;
      if(this.tornTail) { fs.ftruncateSync(this.fd,committed); fs.fsyncSync(this.fd); this.bytes = committed; }
      const directoryFd = fs.openSync(directory,'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    } catch(e) { this.close(); throw e; }
  }
  append(events) {
    if(this.closed) throw fault('JOURNAL_CLOSED');
    const record = {sequence:this.sequence+1,previous:this.hash,events};
    const hash = digest(record), bytes = Buffer.from(JSON.stringify({...record,hash})+'\n');
    if(bytes.length > 262144 || this.bytes + bytes.length > 256*1024*1024) throw fault('EXECUTION_JOURNAL_CAPACITY');
    let written = 0;
    try {
      while(written < bytes.length) {const n=fs.writeSync(this.fd,bytes,written,bytes.length-written);if(n<=0)throw fault('EXECUTION_STORAGE_FAILURE');written+=n;}
      fs.fsyncSync(this.fd);
    } catch(e) { this.close(); throw fault('EXECUTION_STORAGE_FAILURE'); }
    this.sequence++; this.hash=hash; this.bytes+=bytes.length;
  }
  close() {
    if(this.closed) return;
    this.closed = true;
    if(this.fd !== undefined) { try { fs.closeSync(this.fd); } catch {} }
    try { if(JSON.parse(fs.readFileSync(this.lock,'utf8')).owner === this.owner) fs.unlinkSync(this.lock); } catch {}
  }
}
module.exports = {Journal,digest,fault};
