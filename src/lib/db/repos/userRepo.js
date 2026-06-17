// src/lib/db/repos/userRepo.js
import { getAdapter } from '../driver.js';
import { randomUUID } from 'crypto';

export async function getUsers() {
  const db = await getAdapter();
  return db.all('SELECT * FROM users ORDER BY createdAt DESC');
}

export async function getUserById(id) {
  const db = await getAdapter();
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

export async function getUserByEmail(email) {
  const db = await getAdapter();
  return db.get('SELECT * FROM users WHERE email = ?', [email]);
}

export async function getUserByOidcSub(oidcSub) {
  const db = await getAdapter();
  return db.get('SELECT * FROM users WHERE oidcSub = ?', [oidcSub]);
}

export async function createUser({ email, name, role = 'member', oidcSub, avatarUrl } = {}) {
  if (!email) throw new Error('createUser: email is required');
  const db = await getAdapter();
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.run(
      `INSERT INTO users (id, email, name, role, oidcSub, avatarUrl, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, name || null, role, oidcSub || null, avatarUrl || null, now, now]
    );
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed: users.email')) {
      throw new Error('createUser: email already exists');
    }
    throw err;
  }
  return getUserById(id);
}

export async function updateUser(id, updates = {}) {
  const db = await getAdapter();
  const allowed = ['name', 'role', 'avatarUrl', 'isActive', 'lastLoginAt'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (sets.length === 0) return getUserById(id);
  sets.push("updatedAt = datetime('now')");
  values.push(id);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
  return getUserById(id);
}

export async function deleteUser(id) {
  const db = await getAdapter();
  db.run('DELETE FROM users WHERE id = ?', [id]);
}

export async function findOrCreateFromOidc({ sub, email, name, picture } = {}) {
  if (!sub) throw new Error('findOrCreateFromOidc: sub is required');

  // Check by oidcSub first
  let user = await getUserByOidcSub(sub);
  if (user) {
    await updateUser(user.id, { lastLoginAt: new Date().toISOString(), name, avatarUrl: picture });
    return getUserById(user.id);
  }

  // Check by email (link accounts)
  if (email) {
    user = await getUserByEmail(email);
    if (user) {
      const db = await getAdapter();
      db.run(
        `UPDATE users SET oidcSub = ?, lastLoginAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?`,
        [sub, user.id]
      );
      return getUserById(user.id);
    }
  }

  // Create new — first user gets admin
  const allUsers = await getUsers();
  const role = allUsers.length === 0 ? 'admin' : 'member';
  try {
    return await createUser({ email, name, role, oidcSub: sub, avatarUrl: picture });
  } catch (err) {
    if (err.message?.includes('email already exists') || err.message?.includes('UNIQUE constraint')) {
      // Race condition — another request created the user; find and return it
      const existing = sub ? await getUserByOidcSub(sub) : null;
      if (existing) return existing;
      if (email) return await getUserByEmail(email);
      throw err;
    }
    throw err;
  }
}
