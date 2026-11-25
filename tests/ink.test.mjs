import assert from 'node:assert/strict';
const frames = new Map(); let sequence = 0;
globalThis.requestAnimationFrame = fn => { frames.set(++sequence, fn); return sequence; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const flush = () => { const fns = [...frames.values()]; frames.clear(); for (const fn of fns) fn(); };
class FakeContext {
  constructor(canvas) { this.canvas = canvas; this.operations = []; }
}
for (const name of ['setTransform','clearRect','save','restore','beginPath','moveTo','quadraticCurveTo','lineTo','stroke','fill','arc','rect','ellipse','drawImage','fillRect','strokeRect','setLineDash','scale','translate']) FakeContext.prototype[name] = function(...args){ this.operations.push([name,...args]); };
class FakeCanvas {
  constructor() { this.width = 300; this.height = 150; this.clientWidth = 700; this.clientHeight = 450; this.style = {}; this.tabIndex = -1; this.context = new FakeContext(this); this.listeners = {}; this.pointer = null; }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left:100, top:50, width:700, height:450 }; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  removeEventListener(type) { delete this.listeners[type]; }
  setPointerCapture(id) { this.pointer = id; }
  hasPointerCapture(id) { return id === this.pointer; }
  releasePointerCapture() { this.pointer = null; }
}
globalThis.document = {createElement: () => new FakeCanvas()};
globalThis.devicePixelRatio = 2;
const {InkEngine} = await import('../dist/ink.js');
const canvas = new FakeCanvas(); let changes = 0, selection = null;
const engine = new InkEngine(canvas, {onChange: () => changes++, onSelectionChange: s => selection = s});
const ev = (x,y, time=100, extra={}) => ({pointerId:1,pointerType:'pen',pressure:.5,button:0,buttons:1,clientX:100+x/2,clientY:50+y/2,timeStamp:time,preventDefault(){},...extra});
canvas.listeners.pointerdown(ev(100,100));
canvas.listeners.pointermove(ev(500,100,120,{getCoalescedEvents:()=>[ev(200,110,105),ev(350,90,110),ev(500,100,120)]}));
flush();
canvas.listeners.pointerup(ev(700,100,130)); flush();
assert.equal(engine.getStrokes().length,1); assert.equal(engine.getStrokes()[0].points.length,5);
assert.equal(engine.getStrokes()[0].points.at(-1).x,700);
assert.equal(changes,1); assert.equal(engine.canUndo,true);
const initialContentBounds=engine.getContentBounds();
assert.ok(initialContentBounds.x<100&&initialContentBounds.y<90);
assert.ok(initialContentBounds.x+initialContentBounds.width>700,'content bounds include pen padding');
assert.equal(canvas.width,1400); assert.equal(canvas.height,900);
assert.equal(engine.undo(),true); assert.equal(engine.getStrokes().length,0);
assert.equal(engine.redo(),true); assert.equal(engine.getStrokes().length,1);
engine.setTool('eraser');
canvas.listeners.pointerdown(ev(300,0,200)); canvas.listeners.pointermove(ev(300,300,210)); canvas.listeners.pointerup(ev(300,300,220));
assert.equal(engine.getStrokes().length,0,'fast eraser swept segment crosses ink');
assert.equal(engine.getContentBounds(),null,'erased page has no content bounds');
engine.undo(); assert.equal(engine.getStrokes().length,1);
engine.setTool('select'); canvas.listeners.pointerdown(ev(50,50,300));canvas.listeners.pointerup(ev(750,150,310));
assert.equal(selection.ids.length,1);
const input = engine.getRecognitionInput(); assert.equal(input.canvas.width,1050); assert.equal(input.canvas.height,150);
assert.equal(input.strokes.length,0,'selected OCR forces clipped raster instead of out-of-range native paths');
const originalId=engine.getStrokes()[0].id;
canvas.listeners.pointerdown(ev(100,100,320)); canvas.listeners.pointermove(ev(250,250,330)); canvas.listeners.pointerup(ev(250,250,340));
assert.equal(engine.getStrokes()[0].points[0].x,250); assert.equal(engine.getStrokes()[0].points[0].y,250);
assert.equal(engine.getStrokes()[0].id,originalId,'moving preserves stroke identity'); assert.equal(engine.getSelection().x,200);
assert.ok(Math.abs(engine.getContentBounds().x-initialContentBounds.x-150)<1e-9,'content bounds follow a moved group');
engine.undo(); assert.equal(engine.getStrokes()[0].points[0].x,100);
assert.deepEqual(engine.getContentBounds(),initialContentBounds,'undo restores cached original bounds');
engine.redo(); assert.equal(engine.getStrokes()[0].points[0].x,250);
canvas.listeners.pointerdown(ev(200,200,350)); canvas.listeners.pointerup(ev(900,300,360));
canvas.listeners.pointerdown(ev(250,250,370)); canvas.listeners.pointermove(ev(1400,900,380)); canvas.listeners.pointercancel(ev(1400,900,390));
assert.equal(engine.getSelection().x + engine.getSelection().width,1400); assert.equal(engine.getSelection().y + engine.getSelection().height,900);
assert.ok(engine.getStrokes()[0].points.every(p=>p.x>=0&&p.x<=1400&&p.y>=0&&p.y<=900),'whole moved selection remains within page');
engine.undo(); assert.equal(engine.getStrokes()[0].points[0].x,250);
engine.redo(); assert.equal(engine.getStrokes()[0].points[0].x,750);
engine.clearSelection();
engine.setTool('line'); canvas.listeners.pointerdown(ev(30,30,400));canvas.listeners.pointerup(ev(40,50,410));
assert.equal(engine.getStrokes().at(-1).tool,'line');
engine.setTool('pen'); engine.setPenOnly(true); canvas.listeners.pointerdown(ev(20,20,500,{pointerType:'touch'}));
assert.equal(engine.active,null,'finger suppressed in stylus-only mode');
engine.clear(); assert.equal(engine.getStrokes().length,0); engine.undo(); assert.equal(engine.getStrokes().length,2);
engine.setStrokes([{id:'wide-marker',tool:'marker',color:'#ffee88',size:96,points:[{x:100,y:100,p:.5,t:0},{x:200,y:100,p:.5,t:16}]}]); assert.equal(engine.getStrokes()[0].size,96,'wide markers retain their width after reopening');
engine.setStrokes([]); assert.equal(engine.canUndo,false); assert.throws(()=>engine.getRecognitionInput(),/まず文字/);
engine.setPenOnly(false); engine.lastPenTime=-Infinity; engine.setTool('pen');
canvas.listeners.pointerdown(ev(30,30,600,{pointerId:2,pointerType:'touch'}));
canvas.listeners.pointermove(ev(40,40,610,{pointerId:2,pointerType:'touch'}));
assert.equal(engine.active.pointerType,'touch');
canvas.listeners.pointerdown(ev(100,100,620,{pointerId:3,pointerType:'pen'}));
assert.equal(engine.active.pointerType,'pen','stylus takes priority over preceding palm/touch');
canvas.listeners.pointerup(ev(150,150,630,{pointerId:3,pointerType:'pen'}));
assert.equal(engine.getStrokes().length,1,'uncommitted palm path was discarded');
assert.equal(engine.getStrokes()[0].points[0].x,100);
canvas.listeners.pointerdown(ev(50,50,640,{pointerId:4,pointerType:'touch'})); assert.equal(engine.active,null,'palm suppression remains active just after stylus lift');
engine.setTool('select'); canvas.listeners.pointerdown(ev(90,90,650)); canvas.listeners.pointerup(ev(160,160,660));
canvas.listeners.pointerdown(ev(120,120,670)); canvas.listeners.pointermove(ev(200,200,680));
engine.clearSelection(); flush(); assert.equal(engine.active,null); assert.equal(engine.getSelection(),null);
assert.equal(engine.getStrokes()[0].points[0].x,180,'clearing selection during a drag safely finalizes its valid move');
const beforeViewport=structuredClone(engine.getStrokes());
const historyBeforeViewport=engine.history.length;
engine.setViewport(1700,900); assert.equal(engine.width,1700); assert.equal(engine.height,900);
assert.deepEqual(engine.getStrokes(),beforeViewport,'viewport change preserves exact point and pressure data');
assert.equal(engine.history.length,historyBeforeViewport,'viewport change preserves undo history');
assert.equal(engine.sx,canvas.width/1700);
engine.setViewport(1400,3000); assert.equal(engine.sy,canvas.height/3000);
assert.deepEqual(engine.getStrokes(),beforeViewport,'portrait viewport preserves exact ink');
engine.undo(); assert.notDeepEqual(engine.getStrokes(),beforeViewport,'undo still works after viewport changes');
engine.redo(); assert.deepEqual(engine.getStrokes(),beforeViewport);
engine.setStrokes([{id:'large-page-ink',tool:'pen',color:'#ffee88',size:4,pressure:true,points:[{x:100,y:200,p:.2,t:0},{x:5000,y:6000,p:.8,t:16}]}]);
engine.setViewport(7000,8000);
const largeInput=engine.getRecognitionInput();
assert.ok(largeInput.canvas.width<=4096&&largeInput.canvas.height<=4096,'large OCR raster is bounded');
assert.ok(largeInput.strokes[0].points.every(p=>p.x>=0&&p.x<=largeInput.canvas.width&&p.y>=0&&p.y<=largeInput.canvas.height),'native paths match the bounded raster dimensions');
assert.equal(engine.getStrokes()[0].points[1].p,.8);
engine.setViewport(1400,900); assert.equal(engine.getStrokes()[0].points[1].x,5000,'shrinking viewport never truncates saved points');
assert.equal(engine.getRecognitionInput().strokes.length,0,'partly off-viewport paths use the visible clipped raster for OCR');
assert.ok(engine.getContentBounds().x+engine.getContentBounds().width>5000,'content bounds never clip to a smaller viewport');
engine.setViewport(1,999999); assert.equal(engine.width,64); assert.equal(engine.height,16384);
engine.destroy(); assert.equal(Object.keys(canvas.listeners).length,0);
console.log('Ink engine: pointer/coalescing/DPR/undo/redo/eraser sweep/selection/export/palm/clear tests passed.');
