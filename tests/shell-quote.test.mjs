import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shellQuote } from '../hooks/shell-quote.mjs';

test('leaves a plain path untouched', () => {
  assert.equal(shellQuote('/tmp/trim-kit-1.out'), '/tmp/trim-kit-1.out');
});

test('leaves a Windows drive path with forward slashes untouched', () => {
  assert.equal(shellQuote('C:/Users/me/node.exe'), 'C:/Users/me/node.exe');
});

test('single-quotes a value with a space', () => {
  assert.equal(shellQuote('C:/Program Files/nodejs/node.exe'), "'C:/Program Files/nodejs/node.exe'");
});

test('single-quotes a value with a dollar sign so the shell cannot expand it', () => {
  assert.equal(shellQuote('/tmp/$HOME'), "'/tmp/$HOME'");
});

test('closes and reopens the quotes around an embedded single quote', () => {
  assert.equal(shellQuote("it's"), `'it'"'"'s'`);
});

test('quotes an empty value so it stays an argument', () => {
  assert.equal(shellQuote(''), "''");
});
