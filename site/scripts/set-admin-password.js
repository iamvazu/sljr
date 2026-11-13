#!/usr/bin/env node
'use strict';
/**
 * Set (or change) the admin panel password.
 *   npm run admin:password
 * You type the password here, on your own machine. Only a scrypt hash is
 * written to .env — the password itself is never stored anywhere.
 */
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../api/admin');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function ask(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      let data = '';
      stdin.on('data', (c) => { data += c; });
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0]));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(value);
      } else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1);
      } else { value += ch; }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const pw = await ask('New admin password (12+ characters, typing is hidden): ');
  if (pw.length < 12) { console.error('Too short — use at least 12 characters. Nothing was changed.'); process.exit(1); }
  if (process.stdin.isTTY) {
    const again = await ask('Type it again: ');
    if (again !== pw) { console.error('Those did not match. Nothing was changed.'); process.exit(1); }
  }
  const line = `ADMIN_PASSWORD_HASH=${hashPassword(pw)}`;
  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  env = /^ADMIN_PASSWORD_HASH=.*$/m.test(env) ? env.replace(/^ADMIN_PASSWORD_HASH=.*$/m, line) : env.replace(/\s*$/, '\n') + line + '\n';
  fs.writeFileSync(ENV_PATH, env.replace(/^\n/, ''));
  console.log('Saved to .env. Restart the site (npm start), then sign in at /admin');
})();
