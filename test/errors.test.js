// Every message a call can throw is the one documented: word for word.
// Run: node test/errors.test.js

import assert from 'node:assert/strict';
import { suite, test, thrown } from './test.js';
import { MESSAGES } from './messages.js';

suite('errors');

for (const [fn, message] of MESSAGES) {
  test(message, () => assert.equal(thrown(fn), message));
}
