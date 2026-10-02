// Dependency-free ZIP (stored entries, UTF-8 filenames) for the offline tool.
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
async function bytes(data){if(typeof data==='string')return encoder.encode(data);if(data instanceof Uint8Array)return data;if(data instanceof Blob)return new Uint8Array(await data.arrayBuffer());throw new TypeError('Unsupported ZIP data');}
export async function makeZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>65535)throw new RangeError('ZIP needs 1–65535 entries');
 const local=[],central=[],names=new Set();let offset=0,centralSize=0;
 for(const entry of entries){
  const name=entry.name;if(typeof name!=='string'||!name||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||names.has(name))throw new TypeError('Invalid or duplicate ZIP filename');names.add(name);
  const encoded=encoder.encode(name),data=await bytes(entry.data);if(encoded.length>65535||data.length>0xffffffff)throw new RangeError('ZIP entry too large');
  const crc=crc32(data),head=new Uint8Array(30+encoded.length),h=new DataView(head.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,encoded.length,true);head.set(encoded,30);local.push(head,data);
  const record=new Uint8Array(46+encoded.length),c=new DataView(record.buffer);
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,encoded.length,true);c.setUint32(42,offset,true);record.set(encoded,46);central.push(record);centralSize+=record.length;offset+=head.length+data.length;
  if(offset+centralSize>0xffffffff)throw new RangeError('ZIP archive too large');
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
 return new Blob([...local,...central,end],{type:'application/zip'});
}
