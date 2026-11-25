/** Editable starting pages. Text and doodles use the same objects as user-created work. */
const id = (prefix = 'item') => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const C = { white: '#f4f2df', muted: '#b8c9b8', gold: '#ddbd7b', blue: '#a4c5d8', pink: '#d7a5ad' };

export const defaultSettings = {
  folders: [
    { id: 'ideas', name: 'アイデア', color: '#ddbd7b' },
    { id: 'learning', name: '学び', color: '#9fb9d6' },
    { id: 'work', name: '仕事', color: '#caa3aa' },
  ],
  dictionary: [],
  penOnly: false,
  speech: { voiceURI: '', rate: 1, pitch: 1, volume: 1, loop: false, allPages: false },
  color: '#f4f2df',
  size: 4,
  tool: 'pen',
  theme: 'green',
  template: 'blank',
};

const text = (value, x, y, width, size, color = C.white, font = 'chalk') => ({ id: id('text'), text: value, x, y, width, size, color, font });
const stroke = (coordinates, color = C.white, size = 4, tool = 'pen') => ({
  id: id('stroke'), tool, color, size, pressure: false,
  points: coordinates.map(([x, y], i) => ({ x, y, p: 0.5, t: i * 16 })),
});
const line = (x1, y1, x2, y2, color = C.white, size = 3) => stroke([[x1, y1], [x2, y2]], color, size, 'line');
const box = (x, y, w, h, color = C.white, size = 2.5) => stroke([[x, y], [x + w, y + h]], color, size, 'rect');
const check = (x, y, color = C.gold) => stroke([[x, y + 13], [x + 9, y + 22], [x + 29, y - 3]], color, 3.8);
function sparkle(x, y, radius = 16, color = C.gold) {
  return stroke([[x, y - radius], [x + radius * .2, y - radius * .2], [x + radius, y], [x + radius * .2, y + radius * .2], [x, y + radius], [x - radius * .2, y + radius * .2], [x - radius, y], [x - radius * .2, y - radius * .2], [x, y - radius]], color, 3);
}
function underline(x, y, width, color = C.gold) {
  return stroke(Array.from({ length: 16 }, (_, i) => [x + i * width / 15, y + Math.sin(i / 2.4) * 2.7 + i * .24]), color, 4.5);
}
function makeNote(title, folder, texts, strokes, template = 'dots', starred = false) {
  const now = new Date().toISOString();
  return { id: id('note'), title, folder, starred, deleted: false, created: now, updated: now, pageIndex: 0,
    pages: [{ id: id('page'), template, theme: 'green', strokes, texts }] };
}

export function createSampleNotes() {
  const ideas = makeNote('わたしのアイデア帳', 'ideas', [
    text('TODAY’S LITTLE IDEAS', 108, 74, 700, 25, C.gold, 'sans'),
    text('思いつくまま、\n書いてみよう。', 102, 145, 810, 65),
    text('ここから、はじまる。', 108, 420, 700, 35, C.gold),
    text('ペン・マウス・指で、自由に書く', 160, 507, 740, 29),
    text('手書きを文字に変えて、残す', 160, 578, 740, 29),
    text('読み上げて、もう一度たしかめる', 160, 649, 750, 29),
    text('小さなひらめきも、\n大切なアイデア。', 943, 532, 325, 31),
    text('このサンプルも、自由に編集できます。', 108, 798, 1020, 25, C.muted),
  ], [
    underline(112, 354, 547),
    // An actual editable lightbulb, drawn as saved ink paths rather than a flat image.
    stroke([[1042, 317], [1040, 302], [1021, 279], [995, 251], [982, 220], [986, 184], [1003, 154], [1032, 132], [1065, 122], [1099, 125], [1133, 143], [1158, 171], [1172, 207], [1169, 238], [1153, 267], [1132, 292], [1120, 315]], C.white, 4.7),
    stroke([[1042, 317], [1062, 319], [1090, 318], [1121, 316]], C.white, 4.2),
    stroke([[1043, 332], [1066, 331], [1090, 333], [1119, 330]], C.white, 4.5),
    stroke([[1047, 346], [1072, 348], [1115, 345]], C.white, 4.5),
    stroke([[1057, 358], [1069, 366], [1091, 367], [1105, 357]], C.white, 4.2),
    stroke([[1067, 316], [1065, 280], [1058, 249], [1047, 229], [1038, 223], [1032, 232], [1039, 243], [1052, 243], [1064, 228], [1077, 246], [1093, 227], [1104, 244], [1118, 238], [1123, 226], [1114, 221], [1106, 231], [1097, 255], [1092, 285], [1093, 316]], C.gold, 3.5),
    line(1077, 71, 1079, 93, C.gold, 4),
    line(967, 113, 986, 133, C.gold, 4),
    line(930, 213, 956, 215, C.gold, 4),
    line(970, 300, 988, 285, C.gold, 4),
    line(1178, 119, 1196, 100, C.gold, 4),
    line(1201, 205, 1229, 204, C.gold, 4),
    line(1181, 290, 1202, 308, C.gold, 4),
    sparkle(1264, 135, 17, C.white),
    sparkle(920, 331, 11, C.gold),
    // Checklist strokes remain fully erasable and undoable like every other path.
    box(108, 518, 27, 27, C.muted), check(111, 520),
    box(108, 589, 27, 27, C.muted),
    box(108, 660, 27, 27, C.muted),
    // A softly irregular chalk frame and a short annotation flourish.
    stroke([[914, 484], [1032, 480], [1155, 482], [1281, 479], [1285, 575], [1282, 699], [1150, 704], [1020, 702], [913, 706], [911, 586], [914, 484]], C.muted, 2.6),
    underline(947, 659, 214, C.gold),
    stroke([[1220, 730], [1217, 744], [1225, 756], [1240, 759], [1250, 751], [1249, 741], [1238, 735], [1229, 742]], C.gold, 2.7),
    sparkle(1281, 762, 12, C.gold),
  ], 'dots', true);

  const learning = makeNote('学びのノート', 'learning', [
    text('LEARN, IN YOUR OWN WORDS', 108, 76, 1090, 25, C.blue, 'sans'),
    text('学ぶことを、\n自分の言葉に。', 105, 147, 1060, 62),
    text('サンプル：自分に合う学び方', 110, 405, 1000, 34, C.gold),
    text('① 気になったことを、まず書きとめる。', 111, 489, 1130, 31),
    text('② 「なぜ？」を添えて、考えを深める。', 111, 560, 1130, 31),
    text('③ 最後に、ひと言でまとめてみる。', 111, 631, 1130, 31),
    text('読み上げてみると、新しい気づきがあるかも。', 110, 762, 1190, 28, C.blue),
  ], [
    underline(110, 351, 530, C.blue),
    stroke([[1090, 162], [1113, 155], [1141, 155], [1178, 166], [1211, 155], [1246, 154], [1270, 160], [1270, 281], [1234, 277], [1206, 280], [1179, 291], [1150, 280], [1120, 277], [1090, 285], [1090, 162]], C.white, 3.8),
    line(1179, 166, 1179, 290, C.blue, 3),
    line(1114, 185, 1155, 183, C.muted, 2.8), line(1114, 208, 1157, 209, C.muted, 2.8), line(1114, 235, 1156, 235, C.muted, 2.8),
    line(1205, 185, 1246, 183, C.muted, 2.8), line(1205, 208, 1246, 209, C.muted, 2.8), line(1205, 235, 1247, 235, C.muted, 2.8),
    sparkle(1293, 116, 16, C.gold),
    stroke([[130, 694], [363, 695], [616, 694]], C.gold, 22, 'marker'),
  ], 'lines');

  const work = makeNote('次の一歩', 'work', [
    text('MAKE ROOM FOR WHAT MATTERS', 108, 76, 1150, 25, C.pink, 'sans'),
    text('やりたいことを、\n小さな一歩に。', 105, 147, 1100, 62),
    text('今日の小さなチェックリスト', 110, 417, 1120, 35, C.gold),
    text('アイデアを１つ書き出す', 165, 505, 1090, 32),
    text('いちばん小さな行動を決める', 165, 581, 1090, 32),
    text('終わったら、ひと息つく', 165, 657, 1090, 32),
    text('このページは記入例です。自分の予定に書き換えてみましょう。', 110, 792, 1190, 25, C.muted),
  ], [
    underline(110, 351, 534, C.pink),
    box(112, 519, 29, 29, C.pink), box(112, 595, 29, 29, C.pink), box(112, 671, 29, 29, C.pink),
    // A small paper plane made of chalk paths.
    stroke([[1059, 203], [1271, 147], [1225, 328], [1169, 252], [1059, 203]], C.white, 3.8),
    stroke([[1271, 147], [1169, 252], [1132, 292], [1140, 233], [1271, 147]], C.pink, 3.1),
    line(1132, 292, 1185, 273, C.pink, 3.1),
    stroke([[1077, 317], [1040, 330], [1013, 351], [1016, 373], [1041, 379], [1055, 365], [1042, 349], [1013, 350], [984, 373], [967, 397]], C.muted, 2.9),
    sparkle(1300, 352, 14, C.gold),
  ], 'grid');
  return [ideas, learning, work];
}
