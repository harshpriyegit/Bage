// Reset a local account's password from the terminal: npm run reset-password
// Run it yourself so the new password never leaves your machine.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { get, run, hashPassword } from './db.js';

const rl = createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Account email: ')).trim().toLowerCase();
const user = get('SELECT id, name FROM users WHERE email = ?', email);
if (!user) { console.log(`No account with email ${email}`); process.exit(1); }

const which = (await rl.question('Reset which? 1 = login password, 2 = Algoryx private password [1]: ')).trim() || '1';
const column = which === '2' ? 'private_password' : 'password';
const pass = await rl.question('New password (min 12 characters): ');
if (pass.length < 12) { console.log('Too short. Nothing changed.'); process.exit(1); }
if ((await rl.question('Type it again: ')) !== pass) { console.log('Passwords did not match. Nothing changed.'); process.exit(1); }

run(`UPDATE users SET ${column} = ? WHERE id = ?`, hashPassword(pass), user.id);
run('DELETE FROM sessions WHERE user_id = ?', user.id);
console.log(`Done. ${column === 'password' ? 'Login' : 'Private'} password updated for ${user.name}. Sign in again.`);
rl.close();
