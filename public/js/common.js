/* Elytra - helper bersama (dipakai semua halaman) */
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

async function api(url, opts = {}) {
  opts.credentials = 'same-origin';
  if (opts.body instanceof FormData) {
    // Biarkan peramban menyetel Content-Type multipart sendiri
  } else if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (res.status === 401) { location.href = '/masuk'; throw new Error(data?.error || 'Silakan masuk.'); }
  if (!res.ok) throw new Error(data?.error || 'Kesalahan server (' + res.status + ')');
  return data;
}

let tt;
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800);
}

/* Placeholder SVG lokal (inisial nama produk) */
function ph(p) {
  const h = [...(p.nama || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 80 + 200;
  const ini = (p.nama || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${h} 45% 13%)"/><rect x="116" y="66" width="168" height="168" rx="16" fill="none" stroke="hsl(${h} 75% 55%)" stroke-width="12" stroke-dasharray="6 26"/><rect x="124" y="74" width="152" height="152" rx="12" fill="hsl(${h} 50% 21%)" stroke="hsl(${h} 75% 55%)" stroke-width="3"/><circle cx="142" cy="92" r="5" fill="hsl(${h} 75% 55%)"/><text x="200" y="178" font-family="sans-serif" font-size="96" font-weight="700" text-anchor="middle" fill="hsl(${h} 85% 78%)">${esc(ini)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

const LABEL_STATUS = { baru: 'Baru', diproses: 'Diproses', dikirim: 'Dikirim', selesai: 'Selesai', batal: 'Batal' };
const tagStatus = s => `<span class="tag ${esc(s)}">${LABEL_STATUS[s] || esc(s)}</span>`;
const tagRole = r => `<span class="tag role">${esc(r)}</span>`;

/* Topbar sesuai peran pengguna */
async function bootPage({ current, init, needRole } = {}) {
  const { user, toko } = await api('/api/auth/me');
  renderTopbar(user, current);
  if (needRole && (!user || user.role !== needRole)) {
    document.body.insertAdjacentHTML('beforeend',
      `<div class="wrap"><div class="panel" style="text-align:center"><h2>Akses ditolak</h2>
       <p class="muted">Halaman ini khusus peran ${esc(needRole)}. ${user ? 'Anda masuk sebagai ' + esc(user.role) + '.' : 'Silakan masuk terlebih dahulu.'}</p>
       <a class="btn" href="${user ? '/katalog' : '/masuk'}">${user ? 'Ke Katalog' : 'Masuk'}</a></div></div>`);
    throw new Error('no-access');
  }
  await init?.(user, toko);
  return { user, toko };
}

function renderTopbar(user, current) {
  const nav = document.querySelector('.top .nav');
  if (!nav) return;
  const cur = u => u === current ? ' aria-current="page"' : '';
  let html = `<a${cur('/katalog')} href="/katalog">Katalog</a>`;
  if (!user) {
    html += `<a${cur('/masuk')} href="/masuk">Masuk</a><a${cur('/daftar')} href="/daftar">Daftar</a>`;
  } else if (user.role === 'pembeli') {
    html += `<a${cur('/keranjang')} href="/keranjang">Keranjang<span class="badge-count" id="cart-badge" hidden></span></a>
             <a${cur('/pesanan')} href="/pesanan">Pesanan Saya</a>`;
  } else if (user.role === 'seller') {
    html += `<a${cur('/toko')} href="/toko">Dashboard Toko</a>`;
  } else if (user.role === 'admin') {
    html += `<a${cur('/admin')} href="/admin">Panel Admin</a>`;
  }
  if (user) {
    const inisial = user.nama.trim()[0].toUpperCase();
    html += `<span class="userchip"><span class="avatar" aria-hidden="true">${esc(inisial)}</span>
             <span>${esc(user.nama)}<small class="muted"> · ${esc(user.role)}</small></span></span>
             <button class="btn alt sm" id="btn-logout">Keluar</button>`;
  }
  nav.innerHTML = html;
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/katalog';
  });
  if (user?.role === 'pembeli') updateCartBadge();
}

async function updateCartBadge() {
  try {
    const { items } = await api('/api/cart');
    const b = document.getElementById('cart-badge');
    if (!b) return;
    const n = items.reduce((s, i) => s + i.jumlah, 0);
    b.hidden = n === 0; b.textContent = n;
  } catch { /* belum masuk */ }
}

/* Konfirmasi dua langkah pada tombol (dipakai untuk hapus/reset) */
function twoStep(btn, fn, label = 'Yakin?') {
  if (btn.dataset.armed) { clearTimeout(+btn.dataset.armed); btn.textContent = btn.dataset.old; delete btn.dataset.armed; fn(); return; }
  btn.dataset.old = btn.textContent; btn.textContent = label;
  btn.dataset.armed = setTimeout(() => { btn.textContent = btn.dataset.old; delete btn.dataset.armed; }, 3000);
}

/* Ikon mata: tampilkan/sembunyikan isi kolom password (delegasi, semua halaman) */
document.addEventListener('click', e => {
  const b = e.target.closest('.eye');
  if (!b) return;
  const input = b.closest('.pwd').querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.classList.toggle('on', show);
  b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  b.setAttribute('aria-pressed', String(show));
  input.focus();
});

/* Fallback gambar rusak -> placeholder lokal */
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.name && !img.dataset.fb) {
    img.dataset.fb = 1; img.src = ph({ nama: img.dataset.name });
  }
}, true);
