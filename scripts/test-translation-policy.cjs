const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const context = vm.createContext({ console });
for (const file of ['netease-text-matching.js', 'translation-language.js',
    'translation-detection.js', 'translation-alignment.js', 'translation-netease-alignment.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
}
for (const [text, language, expected] of [
    ['I love you', 'en', true], ['我愛你', 'zh', false],
    ['我愛你 I love you', 'zh', true], ['I love you 사랑해', 'ko', true],
    ['Привет', 'other', true], ['مرحبا', 'other', true],
    ['世界', 'ja', true], ['123 ...', 'en', false]
]) assert.equal(context.lineNeedsChineseTranslation(text, language), expected, text);
assert.equal(context.shouldProbeNeteaseTranslation([{ text: '我愛你 hello' }]), true);
assert.equal(context.shouldProbeNeteaseTranslation([{ text: '我愛你' }]), false);
// Isolate translation policy from timestamp assignment, tested with explicit groups.
context.assignNeteaseLinesToLrclib = lines => [lines];
context.lyricLines = [{ timeMs: 0, text: 'I love you 사랑해' }];
const align = lines => context.alignNeteaseToLrclib(lines, 'ko', 0)[0];
assert.equal(align([
    { timeMs: 0, text: 'I love you', translation: '' },
    { timeMs: 500, text: '사랑해', translation: '我愛你' }
]), 'I love you 我愛你');
assert.equal(align([
    { timeMs: 0, text: 'I love you 사랑해', translation: '我愛你 我愛你' },
    { timeMs: 500, text: '사랑해', translation: '我愛你' }
]), '我愛你 我愛你');
assert.equal(align([{ timeMs: 0, text: '사랑해', translation: '' }]), '');
context.lyricLines = [{ timeMs: 0, text: 'I love you' }];
assert.equal(align([{ timeMs: 0, text: 'I love you', translation: '我愛你' }]), '我愛你');
context.lyricLines = [{ timeMs: 0, text: '我愛你' }];
assert.equal(context.alignNeteaseToLrclib([{timeMs: 0, text: '我愛你', translation: '我爱你'}], 'zh', 0)[0], '');
console.log('Translation policy regression checks passed.');
