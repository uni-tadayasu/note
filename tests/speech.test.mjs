import assert from 'node:assert/strict';
import { SpeechReader, applyPronunciations, splitSentences } from '../dist/speech.js';

const dict = [{word:'葛西',reading:'かさい'},{word:'葛西寿史',reading:'かさいただやす'},{word:'かさい',reading:'火災'}];
assert.equal(applyPronunciations('葛西寿史と葛西',dict),'かさいただやすとかさい');
assert.equal(applyPronunciations('{葛西|くずにし} 葛西',dict),'くずにし かさい');
assert.equal(applyPronunciations('C++ a.b [test]',[{word:'C++',reading:'シープラスプラス'},{word:'a.b',reading:'エービー'},{word:'[test]',reading:'テスト'}]),'シープラスプラス エービー テスト');
assert.equal(applyPronunciations('一期一会',{一期一会:'いちごいちえ'}),'いちごいちえ');
const original = '  はじめまして。\n二行目です！ 「説明します。」' + 'あ'.repeat(40) + '{葛西|かさい}' + '😀'.repeat(40);
const chunks = splitSentences(original,32);
for (const chunk of chunks) {
  assert.equal(original.slice(chunk.start,chunk.end),chunk.text);
  assert.ok(!/^\p{Cs}|\p{Cs}$/u.test(chunk.text),'No half-surrogate at a chunk boundary');
}
assert.ok(chunks.some(chunk=>chunk.text.includes('{葛西|かさい}')));

class Synth extends EventTarget {
  constructor(){super();this.paused=false;this.spoken=[];this.cancellations=0;}
  getVoices(){return [{voiceURI:'ja-local',lang:'ja-JP',name:'日本語',default:true,localService:true}]}
  speak(utterance){this.spoken.push(utterance)}
  pause(){this.paused=true;}
  resume(){this.paused=false;}
  cancel(){this.cancellations++;}
}
globalThis.speechSynthesis = new Synth();
globalThis.SpeechSynthesisUtterance = class {constructor(text){this.text=text;}};
const reader = new SpeechReader();
const state=[]; const spoken=[];
assert.ok(reader.isSupported);
assert.ok(reader.speak('葛西です。二文目です。',{dictionary:dict,onState:s=>state.push(s),onSentence:s=>spoken.push(s)}));
let first=reader.utterance;
assert.equal(first.text,'かさいです。');
first.onstart();
assert.equal(reader.state,'speaking');
assert.equal(spoken[0].text,'葛西です。');
assert.ok(reader.pause());
assert.equal(reader.state,'paused');
assert.ok(reader.resume());
assert.equal(reader.state,'speaking');
first.onend();
assert.equal(reader.index,1);
assert.equal(reader.utterance.text,'二文目です。');
reader.utterance.onstart();
reader.utterance.onend();
assert.equal(reader.state,'ended');

reader.speak('古い文章。続き。');
first=reader.utterance;
reader.speak('新しい文章。');
const fresh=reader.utterance;
first.onend();first.onerror({error:'canceled'});
assert.equal(reader.utterance,fresh);
assert.equal(reader.index,0);
reader.stop();fresh.onend();
assert.equal(reader.state,'idle');

reader.speak('一文目。二文目。');
reader.utterance.onstart();
reader.pause();
reader.utterance.onend(); // Some engines deliver end while paused.
assert.equal(reader.state,'paused');
assert.equal(reader.utterance,null);
reader.resume();
assert.equal(reader.utterance.text,'二文目。');
reader.stop();

let error;
reader.speak('',{onError:e=>error=e});
assert.equal(error.code,'empty-text');
assert.equal(reader.state,'error');
reader.speak('試聴。',{onError:e=>error=e});
reader.utterance.onerror({error:'not-allowed'});
assert.equal(error.code,'not-allowed');
assert.equal(reader.state,'error');
reader.destroy();
assert.equal(reader.isSupported,false);
console.log('Speech tests passed: pronunciation precedence, sentence offsets, surrogate/ruby safety, event races, pause/resume, cancellation, errors.');
