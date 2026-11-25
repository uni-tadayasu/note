import { InkEngine } from './ink.js';
import { SpeechReader } from './speech.js';
import { NoteStore, validateBackup, backupPayload } from './storage.js';
import { defaultSettings, createSampleNotes } from './sample-data.js';

const $ = (query, scope = document) => scope.querySelector(query);
const $$ = (query, scope = document) => [...scope.querySelectorAll(query)];
const esc = text => String(text ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dateLabel = value => new Intl.DateTimeFormat('ja-JP', {month:'2-digit',day:'2-digit'}).format(new Date(value));
const paths = {
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',close:'m6 6 12 12M18 6 6 18',menu:'M4 6h16M4 12h16M4 18h16',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  notebook:'M5 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5V3ZM8 3v18M3 7h4M3 12h4M3 17h4M12 8h4M12 12h4',
  star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9L12 3Z',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  settings:'m9 3-.5 3-2 1-2.8-1-2 3.5L4 12l-.3 2.5 2 3.5 2.8-1 2 1 .5 3h4l.5-3 2-1 2.8 1 2-3.5L20 12l2.3-2.5-2-3.5-2.8 1-2-1L15 3H9ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  check:'m5 12 4 4L19 6',help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.2 9a3 3 0 0 1 5.7 1c0 2-3 2-3 4M12 17h.01',
  export:'M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8',more:'M5 12h.01M12 12h.01M19 12h.01',
  sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4',
  volume:'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  undo:'M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5',redo:'M21 10H10a6 6 0 0 0 0 12m11-12-5-5m5 5-5 5',
  pen:'m15 3 6 6-11 11-7 1 1-7L15 3Zm-3 3 6 6M4 14l6 6',
  marker:'m14 3 7 7-9 9-7-7 9-9Zm-9 9-2 7 2 2 7-2M3 21h13',
  eraser:'m15 3 6 6-11 12H6l-5-5L15 3Zm-7 7 7 7M10 21h11',
  text:'M4 5V3h16v2M12 3v18M8 21h8',shapes:'M3 3h10v10H3V3ZM21 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  select:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M12 3h.01M12 21h.01M3 12h.01M21 12h.01',
  chevron:'m7 10 5 5 5-5',sliders:'M5 3v10M5 17v4M12 3v3M12 10v11M19 3v12M19 19v2M2 13h6M9 6h6M16 15h6',
  expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5',fit:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h10v10H7V7Z',
  pages:'M8 3h13v14H8V3ZM3 7v14h14',play:'m7 4 14 8-14 8V4Z',pause:'M8 4v16M16 4v16',stop:'M5 5h14v14H5V5Z',
  repeat:'M3 8h14l4 4M21 16H7l-4-4M21 8v4h-4M3 16v-4h4',download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  upload:'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',copy:'M8 8h13v13H8V8ZM3 16V3h13',folder:'M3 5h6l2 3h10v12H3V5Z',
  line:'M4 20 20 4',rect:'M4 4h16v16H4V4Z',ellipse:'M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0',
  restore:'M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 3',file:'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',
  image:'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M15 7h.01',cloud:'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11H6Z',
  keyboard:'M2 5h20v14H2V5ZM5 9h.01M9 9h.01M13 9h.01M17 9h.01M5 13h.01M9 13h.01M13 13h.01M17 13h.01M8 16h8',
  move:'M12 2v20M2 12h20m-13-7 3-3 3 3m-6 14 3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.notebook}"/></svg>`;
function icons(scope=document){$$('[data-icon]',scope).forEach(node=>{const wrap=document.createElement('span');wrap.innerHTML=icon(node.dataset.icon);const svg=wrap.firstElementChild;for(const cls of node.classList)svg.classList.add(cls);node.replaceWith(svg);});}
icons();

const store = new NoteStore();
const reader = new SpeechReader();
let notes = [], settings = clone(defaultSettings), activeId = '', filter = 'all', search = '', tool = 'pen', color = '#f4f2df', size = 4, zoom = 1, panel = '', ink, storageReady = false;
let settingsTimer, resizeFrame, popoverAnchor, dialogCleanup, speechSegments = [], importBusy = false, boardUnit = 1;
let pendingWrites = new Map(), failedWrites = new Map(), writeChain = Promise.resolve(), writing = false, saveFailed = false, lastSaveError = 0;
const pageTextHistory = new Map();
const textHeightCache = new WeakMap();
const textMeasure = document.createElement('canvas').getContext('2d');
const note = () => notes.find(item=>item.id===activeId);
const page = () => note()?.pages[note().pageIndex || 0];
const folder = id => settings.folders.find(item=>item.id===id);
const colors = ['#f4f2df','#e5c67f','#dfa6a2','#a6c6db','#afd1ad','#b7a3cc'];
const toolNames={pen:'チョーク',marker:'蛍光チョーク',eraser:'消しゴム',text:'テキスト',select:'範囲選択',line:'直線',rect:'四角形',ellipse:'円'};
const templateNames={dots:'ドット',blank:'無地',grid:'方眼',lines:'横罫',cornell:'コーネル'};
const themeColors={green:'#244d40',black:'#30332e',blue:'#24414b'};
function toast(message,error=false){const node=document.createElement('div');node.className=`toast${error?' error':''}`;node.textContent=message;$('#toasts').append(node);setTimeout(()=>node.remove(),error?6500:3300);}
function savingUI(){const bad=saveFailed||!storageReady;$('#saveStatus').classList.toggle('error',bad);$('#saveStatus').innerHTML=icon(bad?'help':'check')+`<span>${bad?'保存を確認':pendingWrites.size||writing?'保存中':'保存済み'}</span>`;$('#saveStatus').title=bad?'端末に保存できていません。書き出しからバックアップしてください。':'このブラウザの端末内に自動保存しています';}
function persist(target=note()){
  if(!target)return;
  target.updated=new Date().toISOString();
  pendingWrites.set(target.id,clone(target));savingUI();
  flushWrites();
}
function flushWrites(){
  if(writing||!pendingWrites.size)return writeChain;
  writing=true;
  writeChain=(async()=>{
    while(pendingWrites.size){
      const [id,item]=pendingWrites.entries().next().value;pendingWrites.delete(id);
      try{
        if(!storageReady)throw new Error('端末の保存機能を使用できません。バックアップを書き出してください。');
        await store.saveNote(item);failedWrites.delete(id);
      }catch(error){
        failedWrites.set(id,item);
        if(Date.now()-lastSaveError>6000){lastSaveError=Date.now();toast(error.message||'保存できませんでした。バックアップを書き出してください。',true);}
      }
      saveFailed=failedWrites.size>0;savingUI();
    }
    writing=false;savingUI();
  })();
  return writeChain;
}
function retryWrites(){
  for(const [id,item]of failedWrites)if(!pendingWrites.has(id))pendingWrites.set(id,item);
  return flushWrites();
}
function persistSettings(){clearTimeout(settingsTimer);settingsTimer=setTimeout(async()=>{if(!storageReady)return;try{await store.saveSettings(settings);}catch(error){toast(error.message,true);}},200);}
function updateNoteList(){
  const visible=notes.filter(item=>filter==='trash'?item.deleted:!item.deleted).filter(item=>filter==='starred'?item.starred:filter.startsWith('folder:')?item.folder===filter.slice(7):true).filter(item=>!search||`${item.title}\n${item.pages.flatMap(p=>p.texts.map(t=>t.text)).join('\n')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>Date.parse(b.updated)-Date.parse(a.updated));
  const active=notes.filter(item=>!item.deleted);
  $('#allCount').textContent=active.length;$('#starCount').textContent=active.filter(item=>item.starred).length;$('#trashCount').textContent=notes.filter(item=>item.deleted).length;
  $('#listCaption').textContent=search?'検索結果':filter==='trash'?'削除したノート':filter==='starred'?'お気に入り':filter.startsWith('folder:')?folder(filter.slice(7))?.name||'ノート':'最近のノート';$('#listCount').textContent=`${visible.length}`;
  $('#noteList').innerHTML=visible.length?visible.map(item=>{const preview=item.pages.flatMap(p=>p.texts.map(t=>t.text)).join(' ').replace(/\n/g,' ')||`${item.pages.length}ページの手書きノート`;return `<button class="note-card ${item.id===activeId?'selected':''}" data-note="${esc(item.id)}" aria-current="${item.id===activeId}"><h3>${esc(item.title||'無題のノート')}</h3>${item.starred?`<span class="note-star">${icon('star')}</span>`:''}<p>${dateLabel(item.updated)}&nbsp; · &nbsp;${esc(preview)}</p></button>`;}).join(''):'<div class="empty-list">ノートが見つかりません。<br>新しいノートを作ってみましょう。</div>';
  $('#folders').innerHTML=settings.folders.map(item=>`<button class="folder-button ${filter===`folder:${item.id}`?'active':''}" data-folder="${esc(item.id)}"><span class="folder-square" style="color:${esc(item.color)}"></span><span>${esc(item.name)}</span><b>${active.filter(n=>n.folder===item.id).length}</b></button>`).join('');
  $$('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.filter===filter));
}
function updateMeta(){const current=note();if(!current)return;const group=folder(current.folder);$('#noteTitle').value=current.title;$('#noteCategory').textContent=group?.name==='アイデア'?'IDEA NOTE':group?.name==='学び'?'LEARNING NOTE':group?.name==='仕事'?'WORK NOTE':group?.name||'MY NOTE';$('#breadcrumbFolder').textContent=group?.name||'マイノート';$('#noteDate').textContent=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric'}).format(new Date(current.created));$('#favoriteBtn').setAttribute('aria-pressed',String(current.starred));$('#favoriteBtn').setAttribute('aria-label',current.starred?'お気に入りから外す':'お気に入りに追加');document.title=`${current.title||'無題のノート'} | 黒板`;$('#noteTitle').disabled=current.deleted;}
function updatePageTabs(){const current=note();if(!current)return;$('#pageTabs').innerHTML=current.pages.map((p,index)=>`<button class="page-tab ${index===current.pageIndex?'active':''}" data-page="${index}" aria-label="${index+1}ページ" aria-current="${index===current.pageIndex}">${String(index+1).padStart(2,'0')}</button>`).join('');$('#pageCount').textContent=`${current.pageIndex+1} / ${current.pages.length} ページ`;$('#strokeCount').textContent=`${page().strokes.length} ストローク`;}
function renderTexts(){const current=page();if(!current)return;$('#textLayer').innerHTML=current.texts.map(text=>`<div class="text-block ${esc(text.font||'chalk')}" data-text="${esc(text.id)}" style="left:calc(var(--board-unit, 1px) * ${text.x});top:calc(var(--board-unit, 1px) * ${text.y});width:calc(var(--board-unit, 1px) * ${text.width||800});font-size:calc(var(--board-unit, 1px) * ${text.size||32});color:${esc(text.color||'#f4f2df')}">${esc(text.text)}</div>`).join('');}
function renderPage({stop=true}={}){if(!page())return;$('#inkCanvas').style.pointerEvents=note().deleted?'none':'auto';if(stop)reader.stop();$('#board').dataset.template=page().template;$('#board').dataset.theme=page().theme;ink?.setStrokes(page().strokes);renderTexts();updatePageTabs();if(panel)renderPanel();scheduleResize();}
function openNote(id){if(!notes.some(item=>item.id===id))return;ink?.finishStroke();reader.stop();activeId=id;note().pageIndex=clamp(note().pageIndex||0,0,note().pages.length-1);settings.lastNoteId=id;persistSettings();zoom=1;updateMeta();updateNoteList();renderPage();closeSidebar();if(note().deleted){toast('ゴミ箱のノートです。その他の操作から復元できます。');setTool('select');}}
function openPage(index,{fromSpeech=false}={}){if(!note()||index<0||index>=note().pages.length)return;ink?.finishStroke();note().pageIndex=index;renderPage({stop:!fromSpeech});persist();}
function scheduleResize(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resizeBoard);}
function resizeBoard(){
  const board=$('#board'),bounds=board.getBoundingClientRect(),current=page();
  if(!bounds.width||!bounds.height||!current)return;
  const fit=Math.min(bounds.width/(current.width||1400),bounds.height/(current.height||900));
  boardUnit=Math.max(fit*zoom,bounds.width/16384,bounds.height/16384);
  board.style.setProperty('--board-unit',`${boardUnit}px`);
  ink?.setViewport(bounds.width/boardUnit,bounds.height/boardUnit);
  setSize(size);
  ink?.resize();
  $('#zoomReset').textContent=`${Math.round(zoom*100)}%`;
}
function capturePageExtent(){
  const current=page();if(!current||!ink)return;
  const bounds=ink.getContentBounds();let width=current.width||1400,height=current.height||900;
  if(bounds){width=Math.max(width,bounds.x+bounds.width);height=Math.max(height,bounds.y+bounds.height);}
  for(const text of current.texts){
    if(!textHeightCache.has(text)){
      const family=text.font==='sans'?'sans-serif':text.font==='serif'?'serif':'Yomogi';textMeasure.font=`${text.size}px ${family}`;let lines=0;
      for(const paragraph of text.text.split('\n')){let line='';lines++;for(const char of [...paragraph]){if(line&&textMeasure.measureText(line+char).width>text.width){lines++;line=char;}else line+=char;}}
      textHeightCache.set(text,lines*text.size*1.65);
    }
    width=Math.max(width,text.x+text.width);height=Math.max(height,text.y+textHeightCache.get(text));
  }
  current.width=Math.min(16384,width);current.height=Math.min(16384,height);
}
function setTool(value){tool=value;ink?.setTool(value);settings.tool=value;persistSettings();$$('[data-tool]').forEach(button=>{const active=button.dataset.tool===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});$('#shapeBtn').classList.toggle('active',['line','rect','ellipse'].includes(value));$('#board').classList.toggle('text-mode',value==='text');const hints={pen:'ペン・マウス・指で、自由に書く',marker:'大切なところに、色を添える',eraser:'なぞった手書きの線を消します',text:'黒板の好きな位置を押して、文字を追加',select:'囲った範囲を文字変換・削除できます',line:'ドラッグして直線を描く',rect:'ドラッグして四角形を描く',ellipse:'ドラッグして円を描く'};$('#toolHint').innerHTML=icon(value==='select'?'select':value==='text'?'text':'pen')+esc(hints[value]);}
function setColor(value){color=value;settings.color=value;ink?.setColor(value);persistSettings();$$('.color-swatch').forEach(button=>{button.classList.toggle('active',button.dataset.color===value);button.setAttribute('aria-pressed',String(button.dataset.color===value));});}
function maxPenSize(){return Math.max(1,Math.min(24,Math.floor(80*boardUnit)));}
function setSize(value){size=clamp(Number(value)||4,1,maxPenSize());settings.size=size;ink?.setSize(size/boardUnit);$('#sizeLabel').textContent=size;$('.size-dot').style.width=`${Math.min(12,size)}px`;$('.size-dot').style.height=`${Math.min(12,size)}px`;persistSettings();}
function showTools(open=!$('#app').classList.contains('tools-open')){ink?.finishStroke();$('#app').classList.toggle('tools-open',open);$('#boardHandle').setAttribute('aria-expanded',String(open));$('#boardHandle').setAttribute('aria-label',open?'道具を閉じる':'道具を開く');$('#boardHandle').innerHTML=icon(open?'close':'pen');if(!open){closePopover();closeSidebar();panel='';$('#inspector').hidden=true;$('#quickSpeech').setAttribute('aria-expanded','false');$('#readPanelBtn').setAttribute('aria-expanded','false');}}
function closeSidebar(){$('#app').classList.remove('sidebar-open');$('#sidebarScrim').hidden=true;}
function openSidebar(){$('#app').classList.add('sidebar-open');$('#sidebarScrim').hidden=false;}
function showPopover(anchor,content){closePopover();popoverAnchor=anchor;const box=$('#popover');box.innerHTML=content;box.hidden=false;const bounds=anchor.getBoundingClientRect();box.style.left=`${Math.min(Math.max(12,bounds.left),window.innerWidth-box.offsetWidth-12)}px`;box.style.top=`${Math.min(bounds.bottom+9,window.innerHeight-box.offsetHeight-12)}px`;}
function closePopover(){$('#popover').hidden=true;popoverAnchor=null;}
const menuItem=(action,name,iconName,extra='')=>`<button class="popover-item ${extra}" data-action="${action}">${icon(iconName)}<span>${name}</span></button>`;
function openDialog(title,html,{wide=false,cleanup=null}={}){ink?.finishStroke();reader.stop();closePopover();if($('#dialog').open)closeDialog();$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;$('#dialog').style.width=wide?'650px':'550px';dialogCleanup=cleanup;$('#dialog').showModal();setTimeout(()=>{const first=$('input:not([type=checkbox]),textarea,select',$('#dialogBody'));first?.focus();},30);}
function closeDialog(){if(dialogCleanup){const cleanup=dialogCleanup;dialogCleanup=null;cleanup();}$('#dialog').close();}
function confirmDialog(title,message,callback,{label='実行する',danger=false}={}){openDialog(title,`<p class="dialog-copy">${esc(message)}</p><div class="dialog-actions"><button class="button" data-dialog-close>キャンセル</button><button class="button ${danger?'danger-text':'primary'}" id="confirmAction">${esc(label)}</button></div>`);$('#confirmAction').onclick=async()=>{closeDialog();await callback();};}
function newPage(template='blank',theme='green'){const w=Math.max(64,innerWidth),h=Math.max(64,innerHeight);return{id:uid(),width:Math.min(16384,Math.max(1400,900*w/h)),height:Math.min(16384,Math.max(900,1400*h/w)),template,theme,strokes:[],texts:[]};}
function blankNote(){const now=new Date().toISOString();return{id:uid(),title:'黒板',folder:settings.folders[0]?.id||'',starred:false,deleted:false,created:now,updated:now,pages:[newPage()],pageIndex:0};}
function isUntouchedSample(candidate){
  if(!candidate)return false;
  const content=value=>JSON.stringify({title:value.title,folder:value.folder,pages:value.pages.map(p=>({template:p.template,theme:p.theme,strokes:p.strokes.map(s=>({tool:s.tool,color:s.color,size:s.size,pressure:s.pressure,points:s.points.map(v=>({x:v.x,y:v.y,p:v.p,t:v.t}))})),texts:p.texts.map(t=>({text:t.text,x:t.x,y:t.y,width:t.width,size:t.size,color:t.color,font:t.font,reading:t.reading||''}))}))});
  return createSampleNotes().some(sample=>content(sample)===content(candidate));
}
function templateOptions(selected){return Object.entries(templateNames).map(([key,name])=>`<button type="button" class="template-option ${key===selected?'selected':''}" data-template-option="${key}"><span class="template-preview ${key}"></span>${name}</button>`).join('');}
function newNoteDialog(){let template='blank';openDialog('新しいノート',`<form id="newNoteForm"><label class="form-field"><span>ノートの名前</span><input name="title" placeholder="ひらめきのノート" maxlength="120" required autocomplete="off"></label><label class="form-field"><span>ノートブック</span><select name="folder">${settings.folders.map(item=>`<option value="${esc(item.id)}" ${filter===`folder:${item.id}`?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><div class="form-field"><span>黒板のスタイル</span><div class="template-grid">${templateOptions(template)}</div></div><div class="dialog-actions"><button type="button" class="button" data-dialog-close>キャンセル</button><button class="button primary" type="submit">ノートを作成</button></div></form>`);$$('[data-template-option]',$('#dialog')).forEach(button=>button.onclick=()=>{template=button.dataset.templateOption;$$('[data-template-option]',$('#dialog')).forEach(b=>b.classList.toggle('selected',b===button));});$('#newNoteForm').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target),now=new Date().toISOString();const created={id:uid(),title:String(data.get('title')).trim()||'無題のノート',folder:String(data.get('folder')),starred:false,deleted:false,created:now,updated:now,pages:[newPage(template)],pageIndex:0};notes.unshift(created);filter='all';search='';$('#search').value='';persist(created);closeDialog();openNote(created.id);setTool('pen');toast('新しいノートを作成しました');};}
function addFolderDialog(){openDialog('ノートブックを追加',`<form id="folderForm"><label class="form-field"><span>名前</span><input name="name" required maxlength="40" placeholder="読書、打ち合わせ、日々のこと…"></label><div class="dialog-actions"><button type="button" class="button" data-dialog-close>キャンセル</button><button class="button primary">追加する</button></div></form>`);$('#folderForm').onsubmit=event=>{event.preventDefault();const name=new FormData(event.target).get('name').trim();if(!name)return;const item={id:uid(),name,color:colors[(settings.folders.length%5)+1]};settings.folders.push(item);persistSettings();updateNoteList();closeDialog();toast('ノートブックを追加しました');};}
function rememberTexts(){if(!page())return;let history=pageTextHistory.get(page().id)||[];history.push(clone(page().texts));if(history.length>30)history.shift();pageTextHistory.set(page().id,history);}
function textEditor(position={x:120,y:120},existing=null,initial=''){
  if(note()?.deleted)return toast('編集するにはノートを復元してください');const pageId=page().id,viewportWidth=ink.width,viewportHeight=ink.height,defaultSize=clamp(Math.round(26/boardUnit),16,300);
  openDialog(existing?'テキストを編集':'テキストを追加',`<div class="text-dialog"><div class="text-options"><select id="textFont" aria-label="書体"><option value="chalk">手書きチョーク</option><option value="sans">読みやすい文字</option><option value="serif">明朝体</option></select><input id="textSize" type="number" min="16" max="300" step="2" value="${existing?.size||defaultSize}" aria-label="文字サイズ"><span class="panel-hint">px</span><input type="color" id="textColor" aria-label="文字色" value="${existing?.color||color}"></div><textarea id="textContent" maxlength="30000" placeholder="ここに文字を入力。OSの手書きキーボードも使えます。" aria-label="テキスト">${esc(existing?.text||initial)}</textarea><label class="form-field"><span>読み方を指定 <small>（必要な場合だけ）</small></span><textarea id="textReading" style="min-height:65px" rows="2" placeholder="この文章の読みだけを、ひらがな・カタカナで指定" maxlength="30000">${esc(existing?.reading||'')}</textarea></label><p class="panel-hint">一部分だけ指定する場合は {漢字|よみ} と入力できます。既存の文字は、テキストツールで押すと編集できます。</p><div class="dialog-actions">${existing?'<button class="button danger-text" id="deleteText">削除</button>':''}<button class="button" data-dialog-close>キャンセル</button><button class="button primary" id="saveText">${existing?'変更を保存':'黒板に追加'}</button></div></div>`);
  $('#textFont').value=existing?.font||'chalk';
  $('#saveText').onclick=()=>{
    const text=$('#textContent').value.trim();if(!text)return toast('文字を入力してください');if(page().id!==pageId)return closeDialog();
    rememberTexts();
    const margin=16/boardUnit,x=existing?.x??clamp(position?.x??margin,0,Math.max(0,viewportWidth-120/boardUnit)),y=existing?.y??clamp(position?.y??margin,0,Math.max(0,viewportHeight-60/boardUnit));
    const entry={id:existing?.id||uid(),text,reading:$('#textReading').value.trim(),x,y,width:existing?.width||Math.max(1,viewportWidth-x-margin),size:clamp(Number($('#textSize').value)||defaultSize,16,300),color:$('#textColor').value,font:$('#textFont').value};
    if(existing){page().texts[page().texts.findIndex(t=>t.id===existing.id)]=entry;}else page().texts.push(entry);
    capturePageExtent();persist();renderTexts();updateNoteList();if(panel)renderPanel();closeDialog();
  };
  if(existing)$('#deleteText').onclick=()=>{rememberTexts();page().texts=page().texts.filter(t=>t.id!==existing.id);persist();renderTexts();updateNoteList();closeDialog();};
}

function speechContent(){
  let text='';const segments=[];const current=note();
  if(!current)return {text,segments};
  current.pages.forEach((item,index)=>{if(!settings.speech.allPages&&index!==current.pageIndex)return;const sorted=[...item.texts].sort((a,b)=>a.y-b.y||a.x-b.x);sorted.forEach(block=>{const spoken=block.reading?.trim()||block.text;if(!spoken.trim())return;if(text)text+='\n\n';const start=text.length;text+=spoken;segments.push({pageIndex:index,textId:block.id,start,end:text.length,display:block.text});});});
  return{text,segments};
}
function voiceOptions(){const voices=reader.getVoices();return '<option value="">日本語の標準音声</option>'+voices.map(voice=>`<option value="${esc(voice.voiceURI)}" ${voice.voiceURI===settings.speech.voiceURI?'selected':''}>${esc(voice.name)} · ${esc(voice.lang)}${voice.localService?'':'（オンライン）'}</option>`).join('');}
function showPanel(type){if(!$('#app').classList.contains('tools-open'))showTools(true);if(type==='page'&&note()?.deleted)return toast('ノートを復元してから編集してください');if(panel===type){panel='';$('#inspector').hidden=true;$('#readPanelBtn').setAttribute('aria-expanded','false');$('#quickSpeech').setAttribute('aria-expanded','false');scheduleResize();return;}panel=type;$('#inspector').hidden=false;$('#readPanelBtn').setAttribute('aria-expanded',String(type==='speech'));$('#quickSpeech').setAttribute('aria-expanded',String(type==='speech'));renderPanel();scheduleResize();}
function renderPanel(){
  if(!panel)return;const content=$('#panelContent');$('#panelTitle').textContent=panel==='speech'?'文字を、声に。':'黒板の設定';
  if(panel==='speech'){
    const value=speechContent();content.innerHTML=`<p class="panel-hint">書いた言葉を、耳でも確かめよう。</p><div class="reading-preview" id="readingPreview">${esc(value.text||'テキストを追加するか、手書きを文字に変換すると、ここから読み上げられます。')}</div><div class="playback-buttons"><button class="button primary" id="playSpeech">${icon('play')}<span>再生</span></button><button class="button" id="pauseSpeech" aria-label="一時停止" title="一時停止">${icon('pause')}</button><button class="button" id="stopSpeech" aria-label="停止" title="停止">${icon('stop')}</button></div><div class="read-status" id="speechStatus"></div><div class="reading-current" id="readingCurrent" aria-live="polite"></div><div class="panel-section"><label class="panel-label" for="voiceSelect">読み上げる声</label><select id="voiceSelect">${voiceOptions()}</select><button class="link-button" id="testVoice" style="margin-top:10px">この声を試聴</button></div><div class="panel-section"><label class="panel-label" for="speechRate">読む速さ <span id="rateValue">${settings.speech.rate.toFixed(1)} 倍</span></label><input id="speechRate" type="range" min="0.5" max="2" step="0.1" value="${settings.speech.rate}"><div class="range-caption"><span>ゆっくり</span><span>はやく</span></div></div><div class="panel-section"><label class="panel-label" for="speechVolume">音量 <span id="volumeValue">${Math.round(settings.speech.volume*100)}%</span></label><input id="speechVolume" type="range" min="0" max="1" step="0.05" value="${settings.speech.volume}"></div><div class="panel-section"><label class="panel-label" for="speechPitch">声の高さ <span id="pitchValue">${settings.speech.pitch.toFixed(1)}</span></label><input id="speechPitch" type="range" min="0.5" max="1.5" step="0.1" value="${settings.speech.pitch}"><p class="panel-hint">自然な声には 1.0 を推奨。調整は次の再生から反映されます。</p></div><label class="check-label"><input id="speechAll" type="checkbox" ${settings.speech.allPages?'checked':''}>全ページを連続で読む</label><label class="check-label"><input id="speechLoop" type="checkbox" ${settings.speech.loop?'checked':''}>くり返し読む</label><hr class="divider"><div class="panel-label">読み方を整える <span>${settings.dictionary.length}語</span></div><button class="button" id="dictionaryBtn" style="width:100%">${icon('notebook')}読み方辞書</button><p class="panel-hint">人名・専門用語は読みを登録できます。声とイントネーションは端末の音声機能に依存します。</p>`;
    $('#playSpeech').onclick=startSpeech;$('#pauseSpeech').onclick=()=>reader.state==='paused'?reader.resume():reader.pause();$('#stopSpeech').onclick=()=>reader.stop();
    $('#voiceSelect').onchange=event=>{settings.speech.voiceURI=event.target.value;persistSettings();};
    [['speechRate','rate','rateValue',value=>`${value.toFixed(1)} 倍`],['speechVolume','volume','volumeValue',value=>`${Math.round(value*100)}%`],['speechPitch','pitch','pitchValue',value=>value.toFixed(1)]].forEach(([id,key,label,format])=>{$(`#${id}`).oninput=event=>{settings.speech[key]=Number(event.target.value);$(`#${label}`).textContent=format(settings.speech[key]);persistSettings();};});
    $('#speechAll').onchange=event=>{reader.stop();settings.speech.allPages=event.target.checked;persistSettings();$('#readingPreview').textContent=speechContent().text||'このノートには、読み上げるテキストがありません。';};
    $('#speechLoop').onchange=event=>{settings.speech.loop=event.target.checked;persistSettings();if(['speaking','paused'].includes(reader.state))toast('くり返し設定は、次の再生から反映されます');};
    $('#dictionaryBtn').onclick=dictionaryDialog;$('#testVoice').onclick=()=>reader.speak('黒板へようこそ。小さなひらめきを、自由に書いてみましょう。',{...settings.speech,dictionary:settings.dictionary,loop:false,onState:updateSpeechUI,onError:error=>toast(error.message,true)});
    updateSpeechUI(reader.state);if(!reader.isSupported){$('#playSpeech').disabled=true;$('#testVoice').disabled=true;$('#speechStatus').textContent='このブラウザは読み上げに対応していません';}
  }else{
    content.innerHTML=`<div class="panel-section"><label class="panel-label">罫線とレイアウト</label><div class="template-grid">${templateOptions(page().template)}</div></div><div class="panel-section"><label class="panel-label">黒板の色</label><div class="theme-options">${Object.entries(themeColors).map(([key,value])=>`<button class="theme-swatch ${page().theme===key?'active':''}" style="background:${value}" data-theme-option="${key}" aria-label="${key==='green'?'深緑':key==='black'?'墨色':'紺色'}"></button>`).join('')}</div></div><hr class="divider"><label class="check-label"><input id="penOnly" type="checkbox" ${settings.penOnly?'checked':''}>ペンのみで手書きする</label><p class="panel-hint">ペン入力に対応した端末で、手のひらや指による書き込みを防ぎます。マウスは引き続き使えます。</p><div class="panel-section"><label class="panel-label" for="noteFolderSelect">保存するノートブック</label><select id="noteFolderSelect">${settings.folders.map(f=>`<option value="${esc(f.id)}" ${note().folder===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div><hr class="divider"><button class="button" id="undoTextBtn" style="width:100%;margin-bottom:10px">${icon('undo')}テキストの編集を戻す</button><button class="button danger-text" id="clearInkBtn" style="width:100%">${icon('eraser')}このページの手書きを消す</button><p class="panel-hint">手書きの消去は、ツールバーの「元に戻す」で取り消せます。</p>`;
    $$('[data-template-option]',content).forEach(button=>button.onclick=()=>{page().template=button.dataset.templateOption;$('#board').dataset.template=page().template;persist();renderPanel();});
    $$('[data-theme-option]',content).forEach(button=>button.onclick=()=>{page().theme=button.dataset.themeOption;$('#board').dataset.theme=page().theme;persist();renderPanel();});
    $('#penOnly').onchange=event=>{settings.penOnly=event.target.checked;ink.setPenOnly(settings.penOnly);persistSettings();toast(settings.penOnly?'ペン専用にしました。指では描かれません。':'指・ペン・マウスで書けます');};
    $('#noteFolderSelect').onchange=event=>{note().folder=event.target.value;persist();updateMeta();updateNoteList();};
    $('#undoTextBtn').disabled=!pageTextHistory.get(page().id)?.length;$('#undoTextBtn').onclick=()=>{const previous=pageTextHistory.get(page().id)?.pop();if(previous){page().texts=previous;persist();renderTexts();renderPanel();updateNoteList();}};
    $('#clearInkBtn').onclick=()=>confirmDialog('手書きを消す','このページの手書きだけを消します。テキストはそのまま残ります。',()=>ink.clear(),{label:'手書きを消す'});
  }
}
function updateSpeechUI(state){const busy=['speaking','paused','loading'].includes(state);if($('#playSpeech')){$('#playSpeech').innerHTML=icon('play')+`<span>${busy?'最初から':'再生'}</span>`;$('#pauseSpeech').disabled=!['speaking','paused'].includes(state);$('#pauseSpeech').innerHTML=icon(state==='paused'?'play':'pause');$('#pauseSpeech').setAttribute('aria-label',state==='paused'?'再開':'一時停止');$('#stopSpeech').disabled=!busy;$('#speechStatus').textContent={idle:'再生ボタンで読み上げます',speaking:'読み上げ中',paused:'一時停止中',ended:'読み終わりました',error:'音声を再生できませんでした',loading:'音声を準備しています'}[state]||'';}if(!busy){$$('.text-block.reading').forEach(element=>element.classList.remove('reading'));}}
function startSpeech(){const value=speechContent();if(!value.text.trim())return toast('テキストを追加するか、手書きを文字に変換してください');speechSegments=value.segments;reader.speak(value.text,{...settings.speech,dictionary:settings.dictionary,onState:updateSpeechUI,onError:error=>toast(error.message,true),onSentence:sentence=>{const segment=speechSegments.find(s=>sentence.start>=s.start&&sentence.start<s.end)||speechSegments.find(s=>sentence.end>s.start&&sentence.start<s.end);if(segment){if(note().pageIndex!==segment.pageIndex)openPage(segment.pageIndex,{fromSpeech:true});$$('.text-block.reading').forEach(element=>element.classList.remove('reading'));$(`[data-text="${CSS.escape(segment.textId)}"]`)?.classList.add('reading');}if($('#readingCurrent'))$('#readingCurrent').textContent=`${sentence.index+1} / ${sentence.total} · ${sentence.text}`;}});}
function dictionaryDialog(){
  openDialog('読み方辞書',`<p class="dialog-copy">人名や専門用語の読みを登録します。文章中の一致する言葉を、登録した読みで読み上げます。</p><form id="dictForm" class="dict-inputs"><input name="word" placeholder="表記（例：黒板）" maxlength="100" required aria-label="表記"><input name="reading" placeholder="読み（例：こくばん）" maxlength="200" required aria-label="読み方"><button class="button primary" type="submit">登録</button></form><div class="dictionary-list" id="dictionaryList"></div><p class="panel-hint">同じ表記を登録すると読みを更新します。長い語を優先して置き換えます。音程やアクセントそのものを完全に固定する機能ではありません。</p><div class="dialog-actions"><button class="button" data-dialog-close>閉じる</button></div>`);
  const render=()=>{$('#dictionaryList').innerHTML=settings.dictionary.length?settings.dictionary.map((entry,index)=>`<div class="dictionary-row"><span>${esc(entry.word)}</span><span class="reading">${esc(entry.reading)}</span><button class="icon-button small" data-dict-play="${index}" aria-label="${esc(entry.word)}の読みを試聴">${icon('volume')}</button><button class="icon-button small" data-dict-delete="${index}" aria-label="${esc(entry.word)}を辞書から削除">${icon('close')}</button></div>`).join(''):'<p class="panel-hint">まだ登録された読み方はありません。</p>';};render();
  $('#dictForm').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target),word=String(data.get('word')).trim(),reading=String(data.get('reading')).trim();if(!word||!reading)return;const existing=settings.dictionary.find(item=>item.word===word);if(existing)existing.reading=reading;else settings.dictionary.push({word,reading});persistSettings();event.target.reset();render();toast('読み方を登録しました');};
  $('#dictionaryList').onclick=event=>{const remove=event.target.closest('[data-dict-delete]'),play=event.target.closest('[data-dict-play]');if(remove){settings.dictionary.splice(Number(remove.dataset.dictDelete),1);persistSettings();render();}if(play){reader.stop();reader.speak(settings.dictionary[Number(play.dataset.dictPlay)].reading,{...settings.speech,loop:false,onState:updateSpeechUI,onError:error=>toast(error.message,true)});}};
}
async function recognizeDialog(){
  if(note()?.deleted)return toast('ノートを復元してから文字変換してください');let input;try{input=ink.getRecognitionInput();}catch(error){return toast(error.message);}
  const controller=new AbortController(),sourcePage=page().id;let result='';
  openDialog('手書きを、文字に。',`<p class="dialog-copy">手書きを端末内で認識します。範囲選択をしてから開くと、その部分だけ変換できます。</p><img class="ocr-preview" src="${input.canvas.toDataURL('image/png')}" alt="文字認識する手書きの範囲"><label class="form-field"><span>文字の言語</span><select id="ocrLanguage"><option value="ja">日本語 ＋ 英語</option><option value="en">英語</option></select></label><div class="ocr-progress"><span id="ocrProgress"></span></div><p class="ocr-status" id="ocrStatus">はっきりした文字を、横書きで認識します。</p><div id="ocrResultArea" hidden><label class="form-field"><span>変換結果を確認・修正</span><textarea id="ocrResult" rows="5" maxlength="30000" aria-label="変換結果"></textarea></label></div><div class="inline-notice" id="ocrWarning">手書きの形や文字のつながりによって誤認識する場合があります。結果を確認してから挿入してください。初回は認識用データを読み込みます。</div><div class="dialog-actions"><button class="button" data-dialog-close>閉じる</button><button class="button primary" id="startOcr">変換を開始</button><button class="button primary" id="insertOcr" hidden>確認して挿入</button></div>`,{cleanup:()=>controller.abort()});
  $('#startOcr').onclick=async()=>{const button=$('#startOcr');button.disabled=true;$('#ocrLanguage').disabled=true;$('#ocrStatus').textContent='認識エンジンを準備しています…';try{const {recognizeHandwriting}=await import('./recognition.js');const output=await recognizeHandwriting({...input,language:$('#ocrLanguage').value,signal:controller.signal,onProgress:({status,progress})=>{if(controller.signal.aborted)return;$('#ocrProgress').style.width=`${Math.round(progress*100)}%`;$('#ocrStatus').textContent=status;}});if(controller.signal.aborted)return;result=output.text||'';$('#ocrResult').value=result;$('#ocrLanguage').disabled=false;$('#ocrResultArea').hidden=false;$('#insertOcr').hidden=false;$('#ocrProgress').style.width='100%';$('#ocrWarning').textContent=output.warning||'変換結果を確認・修正してから挿入してください。';$('#ocrStatus').textContent=result?'認識が完了しました。変換結果を確認してください。':'文字を読み取れませんでした。太めに、間隔を空けて書くか、下の欄に入力してください。';button.textContent='もう一度変換';button.disabled=false;}catch(error){if(controller.signal.aborted)return;$('#ocrStatus').textContent=error.message||'文字認識に失敗しました。ネット接続を確認してやり直してください。';button.disabled=false;$('#ocrLanguage').disabled=false;}};
  $('#insertOcr').onclick=()=>{const text=$('#ocrResult').value.trim();if(!text)return toast('挿入する文字を入力してください');if(page().id!==sourcePage)return closeDialog();const position={x:clamp(input.bounds.x,0,Math.max(0,ink.width-120/boardUnit)),y:clamp(input.bounds.y+input.bounds.height+24/boardUnit,0,Math.max(0,ink.height-100/boardUnit))};closeDialog();setTool('text');textEditor(position,null,text);};
}
function helpDialog(){openDialog('書く。ひらめく。聴く。',`<p class="dialog-copy">ようこそ、黒板へ。ペンでも、マウスでも、指でも。あなたに合う書き方で、自由に使ってください。</p><div class="help-grid"><div class="help-card">${icon('pen')}<h3>自由に、書く</h3><p>黒板いっぱいに、そのまま書けます。右下の道具ボタンから、チョークの色・太さを変更できます。</p></div><div class="help-card">${icon('sparkles')}<h3>手書きを、文字に</h3><p>範囲選択で文字を囲み「文字に変換」。結果を確認して挿入すると、編集や読み上げもできます。</p></div><div class="help-card">${icon('text')}<h3>言葉を、置く</h3><p>Tのツールで黒板を押すと文字を追加。配置済みの文字を押すと編集でき、読み方も指定できます。</p></div><div class="help-card">${icon('volume')}<h3>書いたことを、聴く</h3><p>「読み上げ」で声・速度・音量を調整。人名などは読み方辞書に登録できます。</p></div></div><p class="dialog-copy small-copy">保存先は、この端末のこのブラウザです。ほかの端末への移動にはバックアップの書き出し・読み込みを使ってください。ブラウザデータの削除に備えて定期的なバックアップをおすすめします。</p><div class="shortcut-list"><span><kbd>P</kbd>チョーク</span><span><kbd>E</kbd>消しゴム</span><span><kbd>T</kbd>文字</span><span><kbd>V</kbd>選択</span><span><kbd>F</kbd>道具の表示</span><span><kbd>Ctrl/⌘ Z</kbd>手書きを戻す</span></div><div class="dialog-actions"><button class="button primary" data-dialog-close>書きはじめる</button></div>`,{wide:true});}

function settingsDialog(){
  openDialog('設定とバックアップ',`<div class="setting-row"><div><strong>ノートをまるごと保存</strong><p>すべてのノート・手書き・読み方辞書を<br>1つのファイルに書き出します。</p></div><button class="button" id="backupAll">${icon('download')}書き出し</button></div><div class="setting-row"><div><strong>バックアップを読み込む</strong><p>読み込んだノートをコピーとして追加します。</p></div><button class="button" id="importBackup">${icon('upload')}読み込み</button></div><div class="setting-row"><div><strong>オフラインでも文字変換</strong><p>認識用データ 約14MB を端末に保存。<br>Wi-Fiでの準備がおすすめです。</p></div><button class="button" id="offlinePrepare">準備する</button></div><p id="offlineStatus" class="panel-hint"></p><div class="setting-row"><div><strong>ホーム画面に追加</strong><p>スマホの共有メニューやブラウザの<br>「アプリをインストール」から追加できます。</p></div><img src="assets/icon-192.png" width="44" height="44" style="border-radius:10px" alt="黒板のアプリアイコン"></div><div class="setting-row"><div><strong>読み方辞書</strong><p>登録した読み方：${settings.dictionary.length}語</p></div><button class="button" id="settingsDictionary">辞書を開く</button></div><div class="inline-notice">ノートはこの端末のブラウザ内に保存されます。端末間の自動同期はありません。ブラウザの保存データを削除する前に、バックアップを書き出してください。</div><p class="panel-hint">黒板 v1.1.0 · © KASAI SOLUTIONS INC.<br>文字認識：Tesseract.js / Tesseract · 書体：Yomogi（SIL OFL）</p><div class="dialog-actions"><button class="button" data-dialog-close>閉じる</button></div>`);
  $('#backupAll').onclick=exportBackup;$('#importBackup').onclick=()=>$('#importFile').click();$('#offlinePrepare').onclick=prepareOffline;$('#settingsDictionary').onclick=dictionaryDialog;
}
function download(blob,filename){const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const safeName=title=>(title||'黒板').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,90);
function exportBackup(){try{const data=backupPayload(notes,settings);download(new Blob([JSON.stringify(data)],{type:'application/json'}),`黒板_バックアップ_${new Date().toISOString().slice(0,10)}.json`);toast('バックアップを書き出しました');}catch(error){toast(error.message,true);}}
async function importBackup(file){
  if(!file||importBusy)return;if(file.size>30*1024*1024)return toast('30MB以下のバックアップを選んでください',true);importBusy=true;
  try{const data=validateBackup(JSON.parse(await file.text()));if(!data.notes.length)throw new Error('このバックアップにはノートがありません');const imported=[];for(const source of data.notes){const copy=clone(source);copy.id=uid();copy.title=`${copy.title}（読込）`.slice(0,120);copy.deleted=false;copy.created=new Date().toISOString();copy.updated=copy.created;copy.pages.forEach(p=>{p.id=uid();p.texts.forEach(t=>t.id=uid());p.strokes.forEach(s=>s.id=uid());});if(storageReady)await store.saveNote(copy);imported.push(copy);}
    notes.unshift(...imported);const folderIds=new Set(settings.folders.map(f=>f.id));data.settings.folders.forEach(f=>{if(!folderIds.has(f.id)){settings.folders.push(f);folderIds.add(f.id);}});const words=new Set(settings.dictionary.map(d=>d.word));data.settings.dictionary.forEach(entry=>{if(!words.has(entry.word)){settings.dictionary.push(entry);words.add(entry.word);}});persistSettings();filter='all';search='';$('#search').value='';closeDialog();openNote(imported[0].id);toast(`${imported.length}件のノートをコピーとして読み込みました`);
  }catch(error){toast(error.message||'バックアップを読み込めませんでした',true);}finally{importBusy=false;$('#importFile').value='';}
}
async function pageCanvas(item){
  await document.fonts.ready;
  const width=item.width||1400,height=item.height||900,scale=Math.min(1,4096/Math.max(width,height));
  const scratch=document.createElement('canvas'),temp=new InkEngine(scratch,{width,height});temp.setStrokes(item.strokes);
  const out=document.createElement('canvas');out.width=Math.ceil(width*scale);out.height=Math.ceil(height*scale);const ctx=out.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=themeColors[item.theme]||themeColors.green;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.strokeStyle='rgba(195,215,179,.13)';ctx.fillStyle='rgba(195,215,179,.20)';ctx.lineWidth=1;
  if(item.template==='dots'){for(let x=0;x<=width;x+=48)for(let y=0;y<=height;y+=48){ctx.beginPath();ctx.arc(x,y,1.2,0,Math.PI*2);ctx.fill();}}
  if(['lines','grid'].includes(item.template)){const gap=item.template==='grid'?48:72;for(let y=gap;y<height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}if(item.template==='grid')for(let x=48;x<width;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}}
  if(item.template==='cornell'){ctx.beginPath();ctx.moveTo(width*.25,0);ctx.lineTo(width*.25,height);ctx.moveTo(0,height*.78);ctx.lineTo(width,height*.78);ctx.stroke();}ctx.restore();
  for(const text of item.texts){ctx.save();ctx.fillStyle=text.color;ctx.textBaseline='top';const family=text.font==='sans'?'sans-serif':text.font==='serif'?'serif':'Yomogi';ctx.font=`${text.size}px ${family}`;let y=text.y;for(const paragraph of text.text.split('\n')){let line='';for(const char of [...paragraph]){if(line&&ctx.measureText(line+char).width>text.width){ctx.fillText(line,text.x,y);y+=text.size*1.65;line=char;}else line+=char;}ctx.fillText(line,text.x,y);y+=text.size*1.65;}ctx.restore();}
  ctx.drawImage(temp.exportCanvas({crop:false,scale}),0,0,width,height);temp.destroy();return out;
}
async function exportPNG(){closePopover();const current=note(),index=current.pageIndex;toast('黒板の画像を作成しています');try{const canvas=await pageCanvas(current.pages[index]);canvas.toBlob(blob=>{if(blob){download(blob,`${safeName(current.title)}_${index+1}.png`);toast('PNG画像を書き出しました');}},'image/png');}catch(error){toast('画像を書き出せませんでした。もう一度お試しください。',true);}}
async function printPages(){closePopover();const selected=note();toast('印刷用のページを準備しています');try{const root=$('#printRoot');root.replaceChildren();for(const item of selected.pages){const canvas=await pageCanvas(item);const img=document.createElement('img');img.src=canvas.toDataURL('image/png');img.alt=selected.title;root.append(img);await img.decode();}window.print();}catch(error){toast('印刷の準備に失敗しました',true);}}
function exportText(){const current=note();const text=`${current.title}\n\n`+current.pages.map((p,i)=>`【${i+1}ページ】\n${[...p.texts].sort((a,b)=>a.y-b.y||a.x-b.x).map(t=>t.text).join('\n\n')}`).join('\n\n');download(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}),`${safeName(current.title)}.txt`);closePopover();toast('テキストを書き出しました');}
async function prepareOffline(){const button=$('#offlinePrepare'),status=$('#offlineStatus');button.disabled=true;status.textContent='文字認識用データを準備しています…';try{if(!('serviceWorker'in navigator))throw new Error('このブラウザはオフライン保存に対応していません');const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('オフライン機能がまだ準備できていません。再読み込み後にお試しください。')),12000))]);const worker=registration.active;if(!worker)throw new Error('ページを再読み込みして、もう一度お試しください');const channel=new MessageChannel();const done=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{channel.port1.close();reject(new Error('準備がタイムアウトしました。通信環境を確認して再度お試しください。'));},180000);channel.port1.onmessage=event=>{const data=event.data;if(data.progress!==undefined&&$('#offlineStatus'))$('#offlineStatus').textContent=`保存中… ${data.progress} / ${data.total}`;if(data.done){clearTimeout(timeout);resolve();channel.port1.close();}if(data.error){clearTimeout(timeout);reject(new Error(data.error));channel.port1.close();}};});worker.postMessage({type:'CACHE_OCR'},[channel.port2]);await done;if($('#offlineStatus'))$('#offlineStatus').textContent='準備できました。次回から通信なしでも文字変換できます。';toast('オフラインの文字変換を準備しました');}catch(error){if($('#offlineStatus'))$('#offlineStatus').textContent=error.message;toast(error.message,true);}finally{if(button.isConnected)button.disabled=false;}}
function duplicateNote(){const copy=clone(note()),now=new Date().toISOString();copy.id=uid();copy.title=`${copy.title}（コピー）`.slice(0,120);copy.created=now;copy.updated=now;copy.deleted=false;copy.pages.forEach(p=>{p.id=uid();p.strokes.forEach(s=>s.id=uid());p.texts.forEach(t=>t.id=uid());});notes.unshift(copy);persist(copy);filter='all';openNote(copy.id);toast('ノートを複製しました');}
function trashNote(){const current=note();confirmDialog('ノートをゴミ箱へ',`「${current.title}」をゴミ箱に移動します。後から復元できます。`,()=>{current.deleted=true;persist(current);const next=notes.find(n=>!n.deleted);filter='trash';updateNoteList();if(next){filter='all';openNote(next.id);}else{updateMeta();ink.setTool('select');toast('ノートはゴミ箱から復元できます');}},{label:'ゴミ箱へ移動'});}
function deleteNoteForever(){const current=note();confirmDialog('完全に削除する',`「${current.title}」を完全に削除します。この操作は元に戻せません。`,async()=>{await flushWrites();try{if(storageReady)await store.deleteNote(current.id);notes=notes.filter(n=>n.id!==current.id);const next=notes.find(n=>!n.deleted)||notes[0];if(next)openNote(next.id);else{const now=new Date().toISOString(),blank={id:uid(),title:'新しいノート',folder:settings.folders[0]?.id||'',created:now,updated:now,starred:false,deleted:false,pageIndex:0,pages:[newPage()]};notes.push(blank);persist(blank);filter='all';openNote(blank.id);}updateNoteList();toast('ノートを削除しました');}catch(error){toast(error.message,true);}},{label:'完全に削除',danger:true});}
function pageMenuActions(action){if(note().deleted)return toast('ノートを復元してから編集してください');ink.finishStroke();if(action==='duplicatePage'){const copied=clone(page());copied.id=uid();copied.strokes.forEach(s=>s.id=uid());copied.texts.forEach(t=>t.id=uid());note().pages.splice(note().pageIndex+1,0,copied);openPage(note().pageIndex+1);toast('ページを複製しました');}if(action==='deletePage'){if(note().pages.length===1)return toast('最後の1ページは削除できません');confirmDialog('ページを削除',`${note().pageIndex+1}ページ目を削除します。この操作は元に戻せません。`,()=>{note().pages.splice(note().pageIndex,1);note().pageIndex=Math.min(note().pageIndex,note().pages.length-1);persist();renderPage();},{label:'ページを削除',danger:true});}}
function exportMenu(anchor){showPopover(anchor,menuItem('png','このページをPNG画像に','image')+menuItem('print','全ページをPDF / 印刷','file')+menuItem('text','ノートのテキスト','text')+'<hr>'+menuItem('backup','全ノートのバックアップ','download')+menuItem('import','バックアップを読み込む','upload'));}
function renameNote(){
  if(note().deleted)return;
  openDialog('ノートの名前',`<form id="renameForm"><label class="form-field"><span>名前</span><input name="title" value="${esc(note().title)}" maxlength="120" required></label><div class="dialog-actions"><button class="button" type="button" data-dialog-close>キャンセル</button><button class="button primary">保存</button></div></form>`);
  $('#renameForm').onsubmit=event=>{event.preventDefault();note().title=String(new FormData(event.target).get('title')).trim()||'黒板';persist();updateMeta();updateNoteList();closeDialog();};
}
function moreMenu(anchor){showPopover(anchor,note().deleted?menuItem('restoreNote','ノートを復元','restore')+menuItem('deleteForever','完全に削除','trash','danger'):menuItem('renameNote','名前を変更','text')+menuItem('toggleFavorite',note().starred?'お気に入りから外す':'お気に入りに追加','star')+menuItem('duplicateNote','ノートを複製','copy')+menuItem('moveNote','ノートブックを変更','folder')+'<hr>'+menuItem('trashNote','ゴミ箱へ移動','trash','danger'));}

function bindEvents(){
  $('#boardHandle').onclick=()=>showTools();
  $('#quickNotes').onclick=openSidebar;$('#quickNew').onclick=newNoteDialog;
  $('#quickRecognize').onclick=recognizeDialog;$('#quickSpeech').onclick=()=>showPanel('speech');
  $('#quickExport').onclick=()=>exportMenu($('#quickExport'));$('#quickSettings').onclick=settingsDialog;
  $('#quickNoteMenu').onclick=()=>moreMenu($('#quickNoteMenu'));$('#quickHelp').onclick=helpDialog;
  $('#saveStatus').onclick=()=>{if(failedWrites.size)retryWrites();};$('#newNote').onclick=newNoteDialog;$('#addFolder').onclick=addFolderDialog;$('#menuBtn').onclick=openSidebar;$('#sidebarScrim').onclick=closeSidebar;
  $('#search').oninput=event=>{search=event.target.value;updateNoteList();};$$('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;updateNoteList();});
  $('#folders').onclick=event=>{const button=event.target.closest('[data-folder]');if(button){filter=`folder:${button.dataset.folder}`;updateNoteList();}};
  $('#noteList').onclick=event=>{const button=event.target.closest('[data-note]');if(button)openNote(button.dataset.note);};
  $('#noteTitle').oninput=event=>{note().title=event.target.value;persist();updateNoteList();document.title=`${note().title||'無題のノート'} | 黒板`;};$('#noteTitle').onblur=()=>{if(!note().title.trim()){note().title='無題のノート';updateMeta();persist();}};
  $('#favoriteBtn').onclick=()=>{note().starred=!note().starred;persist();updateMeta();updateNoteList();};
  $('#undoBtn').onclick=()=>ink.undo();$('#redoBtn').onclick=()=>ink.redo();$$('[data-tool]').forEach(button=>button.onclick=()=>setTool(button.dataset.tool));
  $('#colors').innerHTML=colors.map((value,index)=>`<button class="color-swatch ${index===0?'active':''}" style="--swatch:${value}" data-color="${value}" aria-label="${['白','黄','ピンク','水色','緑','紫'][index]}のチョーク" aria-pressed="${index===0}"></button>`).join('')+'<button class="color-swatch custom" id="customColor" aria-label="好きな色を選ぶ"></button>';
  $('#colors').onclick=event=>{const button=event.target.closest('[data-color]');if(button)setColor(button.dataset.color);};$('#customColor').onclick=()=>{showPopover($('#customColor'),`<div class="popover-control"><label for="freeColor">好きな色を選ぶ</label><input type="color" id="freeColor" value="${color}"></div>`);$('#freeColor').oninput=event=>setColor(event.target.value);};
  $('#sizeBtn').onclick=()=>{showPopover($('#sizeBtn'),`<div class="popover-control"><label for="penSizeRange">線の太さ <span id="popoverSize">${size}</span></label><input id="penSizeRange" type="range" min="1" max="${maxPenSize()}" step="1" value="${size}"><div class="range-caption"><span>細い</span><span>太い</span></div></div>`);$('#penSizeRange').oninput=event=>{setSize(event.target.value);$('#popoverSize').textContent=size;};};
  $('#shapeBtn').onclick=()=>showPopover($('#shapeBtn'),menuItem('line','直線','line')+menuItem('rect','四角形','rect')+menuItem('ellipse','円・楕円','ellipse'));
  $('#textLayer').onclick=event=>{if(tool!=='text')return;const target=event.target.closest('[data-text]');if(target)textEditor(null,page().texts.find(item=>item.id===target.dataset.text));};
  $('#recognizeBtn').onclick=recognizeDialog;$('#readPanelBtn').onclick=()=>showPanel('speech');$('#pageSettingsBtn').onclick=()=>showPanel('page');$('#closePanel').onclick=()=>showPanel(panel);
  $('#focusBtn').onclick=()=>showTools(false);
  $('#zoomOut').onclick=()=>{zoom=clamp(zoom-.25,.5,3);scheduleResize();};$('#zoomIn').onclick=()=>{zoom=clamp(zoom+.25,.5,3);scheduleResize();};$('#zoomReset').onclick=$('#fitBtn').onclick=()=>{zoom=1;scheduleResize();};
  $('#addPage').onclick=()=>{if(note().deleted)return toast('ノートを復元してから編集してください');const previous=page();note().pages.push(newPage(previous.template,previous.theme));openPage(note().pages.length-1);toast('ページを追加しました');};
  $('#pageTabs').onclick=event=>{const button=event.target.closest('[data-page]');if(button)openPage(Number(button.dataset.page));};
  $('#pageMenu').onclick=()=>showPopover($('#pageMenu'),menuItem('duplicatePage','ページを複製','copy')+menuItem('deletePage','ページを削除','trash','danger'));
  $('#exportBtn').onclick=()=>exportMenu($('#exportBtn'));$('#moreBtn').onclick=()=>moreMenu($('#moreBtn'));$('#helpBtn').onclick=helpDialog;$('#settingsBtn').onclick=settingsDialog;
  $('#closeDialog').onclick=closeDialog;$('#dialog').addEventListener('click',event=>{if(event.target.closest('[data-dialog-close]'))closeDialog();if(event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});$('#dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  $('#importFile').onchange=event=>importBackup(event.target.files[0]);
  $('#popover').onclick=event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;closePopover();if(['line','rect','ellipse'].includes(action))return setTool(action);const actions={png:exportPNG,print:printPages,text:exportText,backup:exportBackup,import:()=>$('#importFile').click(),renameNote,toggleFavorite:()=>{$('#favoriteBtn').click();},duplicateNote,trashNote,deleteForever:deleteNoteForever,moveNote:()=>{if(panel!=='page')showPanel('page');},restoreNote:()=>{note().deleted=false;persist();filter='all';updateMeta();updateNoteList();renderPage();setTool('pen');toast('ノートを復元しました');},duplicatePage:()=>pageMenuActions(action),deletePage:()=>pageMenuActions(action)};actions[action]?.();};
  document.addEventListener('pointerdown',event=>{if(!$('#popover').hidden&&!$('#popover').contains(event.target)&&!popoverAnchor?.contains(event.target))closePopover();});
  document.addEventListener('keydown',event=>{const input=event.target.closest('input,textarea,select,[contenteditable=true]');if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();showTools(true);openSidebar();$('#search').focus();return;}if($('#dialog').open||input)return;if(event.key==='Escape'){showTools(false);ink.clearSelection();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?ink.redo():ink.undo();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();retryWrites().then(()=>toast(saveFailed?'まだ保存できていません。バックアップを書き出してください。':'ノートを端末に保存しました',saveFailed));return;}if(event.ctrlKey||event.metaKey||event.altKey)return;const map={p:'pen',m:'marker',e:'eraser',t:'text',v:'select',l:'line'};if(map[event.key.toLowerCase()])setTool(map[event.key.toLowerCase()]);if(event.key.toLowerCase()==='f')showTools();if((event.key==='Delete'||event.key==='Backspace')&&ink.getSelection()){event.preventDefault();ink.deleteSelection();}});
  window.addEventListener('resize',scheduleResize);window.visualViewport?.addEventListener('resize',scheduleResize);new ResizeObserver(scheduleResize).observe($('#canvasZone'));
  window.addEventListener('pagehide',()=>{flushWrites();if(storageReady)store.saveSettings(settings).catch(()=>{});reader.stop();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushWrites();});
  reader.addEventListener('voiceschanged',()=>{if($('#voiceSelect'))$('#voiceSelect').innerHTML=voiceOptions();});
}
function suppressBrowserOptions(){
  const editable=target=>target instanceof Element&&Boolean(target.closest('input,textarea,select,[contenteditable=true]'));
  document.addEventListener('contextmenu',event=>event.preventDefault(),{capture:true});
  document.addEventListener('dblclick',event=>event.preventDefault(),{capture:true});
  document.addEventListener('dragstart',event=>event.preventDefault(),{capture:true});
  document.addEventListener('selectstart',event=>{if(!editable(event.target))event.preventDefault();},{capture:true});
  for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,event=>event.preventDefault(),{passive:false});
  document.addEventListener('wheel',event=>{if(event.ctrlKey)event.preventDefault();},{passive:false});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['+','-','=','0'].includes(event.key))event.preventDefault();},{capture:true});
  let lastTouchEnd=0;
  $('#board').addEventListener('touchend',event=>{const now=performance.now();if(now-lastTouchEnd<350)event.preventDefault();lastTouchEnd=now;},{passive:false});
}
async function boot(){
  try{
    await store.open();storageReady=true;
    const saved=await store.getSettings();if(saved)settings={...clone(defaultSettings),...saved,speech:{...defaultSettings.speech,...saved.speech}};
    notes=await store.listNotes();
    if(!notes.length){const blank=blankNote();notes=[blank];settings.lastNoteId=blank.id;settings.tool='pen';await store.saveNote(blank);}
  }catch(error){storageReady=false;toast(error.message||'端末への保存機能を使用できません。バックアップを書き出してください。',true);if(!notes.length)notes=[blankNote()];}
  if(!settings.folders?.length)settings.folders=clone(defaultSettings.folders);if(!settings.dictionary)settings.dictionary=[];
  activeId=notes.some(item=>item.id===settings.lastNoteId&&!item.deleted)?settings.lastNoteId:(notes.find(item=>item.starred&&!item.deleted)||notes.find(item=>!item.deleted)||notes[0]).id;
  if((settings.boardLayoutVersion||0)<2){
    // Keep earlier notes intact; an unedited example no longer fills the initial board.
    if(isUntouchedSample(note())){const blank=blankNote();notes.unshift(blank);activeId=blank.id;settings.lastNoteId=blank.id;settings.tool='pen';if(storageReady)await store.saveNote(blank);}
    settings.boardLayoutVersion=2;settings.template='blank';persistSettings();
  }
  ink=new InkEngine($('#inkCanvas'),{width:page().width||1400,height:page().height||900,onChange:(strokes,history)=>{if(!page()||note().deleted)return;capturePageExtent();page().strokes=strokes;persist();$('#strokeCount').textContent=`${strokes.length} ストローク`;$('#undoBtn').disabled=!history.canUndo;$('#redoBtn').disabled=!history.canRedo;},onHistoryChange:history=>{$('#undoBtn').disabled=!history.canUndo;$('#redoBtn').disabled=!history.canRedo;},onTextRequest:position=>textEditor(position),onSelectionChange:selection=>{if(tool==='select'&&selection)$('#toolHint').textContent=`${selection.ids.length}本の線を選択 · 「文字に変換」または Delete`;}});
  bindEvents();suppressBrowserOptions();setTool('pen');setColor(settings.color||colors[0]);setSize(settings.size||4);ink.setPenOnly(settings.penOnly);openNote(activeId);savingUI();document.fonts.ready.then(scheduleResize);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
}

boot().catch(error=>{toast('起動に失敗しました。ページを再読み込みしてください。',true);console.error(error);});
