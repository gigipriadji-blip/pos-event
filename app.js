// =========================================================================
// JEMBATAN OTOMATIS V2: GITHUB TO GOOGLE SHEETS API
// =========================================================================
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzDoPLysvwvTLbOG042-EQLYv5NKTOSj4MtvO-ckQxJfAdYnNLl2iDQcjCyWdKYxG6O/exec";

function createGasProxy(successCb, failureCb) {
  return new Proxy({}, {
    get: function(target, prop) {
      if (prop === 'withSuccessHandler') {
        return function(cb) { return createGasProxy(cb, failureCb); };
      }
      if (prop === 'withFailureHandler') {
        return function(cb) { return createGasProxy(successCb, cb); };
      }
      return function(...args) {
        fetch(WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: prop, data: args })
        })
        .then(r => r.json())
        .then(res => {
          if(res.status === 'success' && successCb) successCb(res.data);
          if(res.status === 'error' && failureCb) failureCb(res.message);
        })
        .catch(err => {
          console.error("Gagal terhubung ke Database:", err);
          if(failureCb) failureCb(err);
        });
      };
    }
  });
}

const google = {
  script: {
    run: createGasProxy(null, null)
  }
};

// =========================================================================
// DATABASE LOKAL (INDEXEDDB VIA DEXIE.JS)
// =========================================================================
const db = new Dexie("ScreamousPOS_DB");

// Kita buat dua tabel utama: 'inventory' untuk stok, dan 'transactions' untuk antrean kasir
db.version(1).stores({
  inventory: 'Barcode, ArticleCode, ArticleName, Size, Price, PromoPrice, Stock, Category, Color',
  transactions: '++id, trxId, date, method, note, discount, grandTotal, cart, status' // status nanti berisi 'pending' atau 'synced'
});

console.log("Brankas Lokal Dexie.js Siap Beroperasi!");
// =========================================================================

// =========================================================================
// ENGINE SINKRONISASI INVENTORY (CLOUD <-> LOKAL)
// =========================================================================
async function initDatabase() {
  const dbBadge = document.getElementById('dbStatusBadge');
  if(dbBadge) {
    dbBadge.className = 'badge bg-secondary ms-2 p-2 fs-6 text-white';
    dbBadge.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 1rem; height: 1rem;"></span> Syncing...';
  }

  // Jika ada internet, sedot data terbaru dari Google Sheets
  if (navigator.onLine) {
    google.script.run
      .withFailureHandler(err => {
        console.error("Gagal tarik dari server, pindah ke lokal", err);
        loadFromLocal();
      })
      .withSuccessHandler(async (data) => {
        // 1. Bersihkan brankas lokal lama
        await db.inventory.clear();
        // 2. Simpan data terbaru ke brankas lokal
        await db.inventory.bulkAdd(data);

        // 3. Masukkan ke memori aplikasi kasir
        inventoryData = data;
        renderPosList(inventoryData);
        if(typeof loadFreeStuffInventory === 'function') loadFreeStuffInventory();
        if(typeof loadInventoryTable === 'function') loadInventoryTable();

        // 4. Ubah indikator jadi HIJAU (Ready)
        if(dbBadge) {
          dbBadge.className = 'badge bg-success ms-2 p-2 fs-6 text-white';
          dbBadge.innerHTML = '● Database Ready';
        }
      })
      .getInventory();
  } else {
    // Jika internet mati sejak pagi, langsung buka brankas lokal
    loadFromLocal();
  }
}

// Fungsi darurat untuk membaca dari brankas lokal saat offline
async function loadFromLocal() {
  const data = await db.inventory.toArray();
  inventoryData = data;
  renderPosList(inventoryData);
  if(typeof loadFreeStuffInventory === 'function') loadFreeStuffInventory();
  if(typeof loadInventoryTable === 'function') loadInventoryTable();

  const dbBadge = document.getElementById('dbStatusBadge');
  if(dbBadge) {
    dbBadge.className = 'badge bg-warning ms-2 p-2 fs-6 text-dark';
    dbBadge.innerHTML = '⚡ Offline Mode (Local DB)';
  }
}

// =========================================================================
// =========================================================================
// KODE ASLI APP.JS ANDA DIMULAI DI BAWAH INI
// =========================================================================

  let inventoryData = []; let cart = []; let freeCart = []; 
  let recapData = []; let freeLogData = [];
  let currentSettings = { shopName: 'SCREAMOUS', eventName: 'Event Pop-up Store', footer: 'Thank you for shopping with us!', keyCash: 'F8', keyQris: 'F9', keyCard: 'F10', keyTransfer: 'F11' };
  
  let selectedPaymentMethod = ''; 
  let activeKeyBindTarget = null; 

  function startLiveClock() { setInterval(() => { const now = new Date(); const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']; const dayName = days[now.getDay()]; const dateString = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); const timeString = now.toLocaleTimeString('id-ID', { hour12: false }); document.getElementById('liveClock').innerText = `${dayName}, ${dateString} | ${timeString}`; }, 1000); }

  // INI DIA KUNCI KONTAK YANG HILANG KEMARIN (FUNGSI INIT OTOMATIS)
  window.onload = () => {
    const printToggle = document.getElementById('setEnablePrint');
if(printToggle) printToggle.checked = (localStorage.getItem('screamous_autoprint') !== 'false');
    startLiveClock(); 
    const fpConfig = { dateFormat: "Y-m-d", disableMobile: "true" };
    flatpickr("#recapStartDate", fpConfig); flatpickr("#recapEndDate", fpConfig); flatpickr("#rfStartDate", fpConfig); flatpickr("#rfEndDate", fpConfig); flatpickr("#closingDateInput", fpConfig);
    
    google.script.run.withSuccessHandler(settings => { currentSettings = settings; applyReceiptSettings(); loadSettingsForm(); calculateTotal(); }).getSettings();
    // KODE BARU: Jalankan mesin sinkronisasi lokal Dexie (Menggantikan getInventory lama)
    initDatabase();
  } else {
    
    const today = new Date().toISOString().split('T')[0]; 
    document.getElementById('recapStartDate').value = today; document.getElementById('recapEndDate').value = today; document.getElementById('rfStartDate').value = today; document.getElementById('rfEndDate').value = today; document.getElementById('closingDateInput').value = today;
    
    const posSearch = document.getElementById('posSearch');
    if(posSearch) posSearch.addEventListener('keypress', function(e) { if(e.key === 'Enter') { searchItem(this.value); this.value = ''; } });
    
    const freeSearch = document.getElementById('freeSearch');
    if(freeSearch) freeSearch.addEventListener('keypress', function(e) { if(e.key === 'Enter') { searchFreeItem(this.value); this.value = ''; } });
    
    const restockModal = document.getElementById('restockModal'); 
    if(restockModal) {
      restockModal.addEventListener('shown.bs.modal', function () { document.getElementById('rsBarcode').focus(); }); 
      restockModal.addEventListener('hidden.bs.modal', function () { document.getElementById('rsBarcode').value = ''; document.getElementById('rsName').value = ''; document.getElementById('rsQty').value = ''; document.getElementById('btnSubmitRestock').disabled = true; });
    }
    
    // Pengecekan Lencana Darurat Offline
    setTimeout(() => { if(typeof checkOfflineBadge === 'function') checkOfflineBadge(); }, 1000);
  };

  // SHORTCUT KEYBOARD KASIR DENGAN SABUK PENGAMAN KETIKAN
  window.addEventListener('keydown', function(e) {
    if (activeKeyBindTarget) {
      e.preventDefault();
      const code = e.code; 
      const btnBind = document.getElementById('btnBind' + activeKeyBindTarget);
      if (btnBind) btnBind.innerText = code;
      currentSettings['key' + activeKeyBindTarget.charAt(0) + activeKeyBindTarget.slice(1).toLowerCase()] = code;
      activeKeyBindTarget = null;
      Swal.fire('Shortcut Dideteksi', 'Klik tombol Simpan di halaman Setting untuk membekukan.', 'success');
      return;
    }

    const pressedKey = e.code;

    // 1. PRIORITAS UTAMA: Cek Shortcut Pembayaran Dulu (Bypass Kursor)
    if (pressedKey === currentSettings.keyCash) { e.preventDefault(); selectPaymentMethod('CASH'); return; }
    if (pressedKey === currentSettings.keyQris) { e.preventDefault(); selectPaymentMethod('QRIS'); return; }
    if (pressedKey === currentSettings.keyCard) { e.preventDefault(); selectPaymentMethod('CARD'); return; }
    if (pressedKey === currentSettings.keyTransfer) { e.preventDefault(); selectPaymentMethod('TRANSFER'); return; }

    // 2. SABUK PENGAMAN KETIKAN (Untuk shortcut lain jika ada)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return; 

  });

  function startKeyScan(target) {
    activeKeyBindTarget = target;
    const btn = document.getElementById('btnBind' + target);
    btn.innerText = "Mendengar... Silakan Tekan Tombol Apapun!";
    btn.className = "btn btn-sm btn-danger w-100 fw-bold animate-pulse";
  }

  function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    const methods = ['CASH', 'QRIS', 'CARD', 'TRANSFER'];
    methods.forEach(m => {
      const btn = document.getElementById('btnPay' + m);
      if (m === method) btn.className = "btn btn-warning btn-kasir flex-grow-1 fw-bold text-dark"; 
      else btn.className = "btn btn-outline-warning btn-kasir flex-grow-1 border-secondary text-muted"; 
    });
    togglePaymentUI(); calculateTotal();
  }

  function togglePaymentUI() { 
    const noteEl = document.getElementById('paymentNote'); const cashUI = document.getElementById('cashUI'); 
    if(selectedPaymentMethod === 'CASH') { noteEl.style.display = 'none'; cashUI.style.display = 'block'; setTimeout(() => document.getElementById('cashGiven').focus(), 100); } 
    else if(selectedPaymentMethod) { noteEl.style.display = 'block'; cashUI.style.display = 'none'; } 
    else { noteEl.style.display = 'none'; cashUI.style.display = 'none'; } 
  }

  function toggleDiscountUI() { 
    const type = document.getElementById('discountType').value; 
    const shortcuts = document.getElementById('discountShortcuts');
    const isPromoActive = document.getElementById('setPromoMode') && document.getElementById('setPromoMode').checked;
    
    if(shortcuts) { 
      if(isPromoActive) { 
        shortcuts.style.display = 'none'; // Sembunyikan shortcut jika promo otomatis jalan
      } else if(type === 'override') { 
        shortcuts.style.display = 'block'; 
      } else { 
        shortcuts.style.display = 'none'; 
      }
    } 
  }

  // Menangkap klik dari tombol saklar Promo di halaman Setting
  function handlePromoToggle(isChecked) {
    toggleDiscountUI();
    calculateTotal();
  }

  function searchItem(query) {
    if(!query) return;
    const q = String(query).toLowerCase(); 
    let item = inventoryData.find(i => String(i.Barcode || '').toLowerCase() === q);
    
    if(!item) item = inventoryData.find(i => String(i['Article Code'] || '').toLowerCase() === q || String(i['Article Name'] || '').toLowerCase().includes(q));
    
    if(item) { 
      // 1. Cek apakah stok fisik barang ini memang sedang habis/0
      if(item.Stock <= 0) { 
        Swal.fire('Stok Habis!', 'Item ini sudah tidak tersedia di inventory.', 'error'); 
        return; 
      } 
      
      let cartItem = cart.find(c => c.barcode === item.Barcode); 
      
      if(cartItem) { 
        // --- FITUR BARU: POPUP PROTEKSI DOUBLE SCAN (DETAIL DENGAN SIZE) ---
        Swal.fire({
          title: 'Barang Sudah Ada!',
          text: `Artikel "${item['Article Name']} size ${item.Size}" ini sudah masuk cart. Apakah Anda ingin menambahkannya lagi?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#F7A600',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Ya, Tambah Lagi',
          cancelButtonText: 'Tidak, Batal'
        }).then((result) => {
          if (result.isConfirmed) {
            // Proteksi tambahan agar kasir tidak menambah qty melebihi stok yang ada
            if (cartItem.qty >= item.Stock) {
              Swal.fire('Stok Tidak Cukup!', `Sisa stok untuk artikel ini hanya ${item.Stock} Pcs.`, 'warning');
              return;
            }
            cartItem.qty++; 
            cartItem.subtotal = cartItem.qty * cartItem.price; 
            renderCart();
          }
        });
      } else { 
        // Jika belum ada di keranjang, langsung masukkan tanpa tanya
        cart.push({ 
          barcode: item.Barcode, 
          articleName: item['Article Name'], 
          size: item.Size, 
          price: Number(item.Price), 
          qty: 1, 
          subtotal: Number(item.Price) 
        }); 
        renderCart(); 
      } 
    } else {
      Swal.fire('Oops!', 'Item tidak ditemukan di inventory.', 'warning');
    }
  }
  // ==========================================
  // --- ENGINE KERANJANG BELANJA & KALKULASI ---
  // ==========================================

  function renderCart() {
    const tbody = document.getElementById('cartTableBody');
    if(!tbody) return; // Pengaman
    tbody.innerHTML = '';
    
    const isPromoActive = document.getElementById('setPromoMode') && document.getElementById('setPromoMode').checked;

    cart.forEach((c, index) => {
      let displayPrice = c.price;
      let displaySubtotal = c.subtotal;
      let promoInfo = '';

      if (isPromoActive) {
        let invItem = inventoryData.find(i => String(i.Barcode).toLowerCase() === String(c.barcode).toLowerCase());
        if (invItem && Number(invItem['Harga Promo']) > 0 && Number(invItem['Harga Promo']) < c.price) {
           displayPrice = Number(invItem['Harga Promo']);
           displaySubtotal = displayPrice * c.qty;
           promoInfo = `<br><span class="badge bg-warning text-dark mt-1" style="font-size:10px;"><i class="bi bi-tag-fill"></i> Promo</span>`;
        }
      }

      tbody.innerHTML += `<tr>
        <td>
          <strong class="text-info" style="font-size:13px;">${c.articleName}</strong>
          ${promoInfo}
        </td>
        <td style="font-size:13px;">${c.size}</td>
        <td style="font-size:13px;">
           ${promoInfo ? `<del class="text-muted" style="font-size:11px;">Rp ${c.price.toLocaleString('id-ID')}</del><br>` : ''}
           Rp ${displayPrice.toLocaleString('id-ID')}
        </td>
        <td style="width: 70px;">
           <input type="number" class="form-control form-control-sm bg-dark text-success border-success text-center" value="${c.qty}" onchange="updateQty(${index}, this.value)">
        </td>
        <td class="text-warning fw-bold" style="font-size:13px;">Rp ${displaySubtotal.toLocaleString('id-ID')}</td>
        <td><button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeCart(${index})">X</button></td>
      </tr>`;
    });
    
    calculateTotal();
  }

  function updateQty(index, val) {
    if (val <= 0) { removeCart(index); } 
    else {
      cart[index].qty = Number(val);
      cart[index].subtotal = cart[index].qty * cart[index].price;
      renderCart();
    }
  }

  function removeCart(index) {
    cart.splice(index, 1);
    renderCart();
  }

  function clearCart() {
    cart = [];
    
    // 1. Bersihkan Diskon
    const discVal = document.getElementById('discountValue');
    if(discVal) discVal.value = '';
    
    // 2. Bersihkan Catatan
    const note = document.getElementById('paymentNote');
    if(note) note.value = '';

    // 3. TAMBAHAN: Bersihkan Uang Diterima (Cash Given)
    const cashInput = document.getElementById('cashGiven');
    if(cashInput) cashInput.value = '';

    // 4. TAMBAHAN: Reset Label Kembalian jadi Rp 0
    const changeAmount = document.getElementById('changeAmount');
    if(changeAmount) {
      changeAmount.innerText = 'Rp 0';
      changeAmount.className = 'text-success';
    }

    // 5. TAMBAHAN: Reset pilihan metode bayar agar kasir memilih lagi di transaksi berikutnya
    selectedPaymentMethod = '';
    const methods = ['CASH', 'QRIS', 'CARD', 'TRANSFER'];
    methods.forEach(m => {
      const btn = document.getElementById('btnPay' + m);
      if(btn) btn.className = "btn btn-outline-warning btn-kasir flex-grow-1 border-secondary text-muted"; 
    });
    togglePaymentUI();

    renderCart();
  }

  function calculateTotal() {
    let totalQty = 0;
    let subtotal = 0;
    let autoDiscount = 0;
    const isPromoActive = document.getElementById('setPromoMode') && document.getElementById('setPromoMode').checked;
    
    cart.forEach(c => {
      totalQty += c.qty;
      subtotal += (c.price * c.qty);
      
      if (isPromoActive) {
        let invItem = inventoryData.find(i => String(i.Barcode).toLowerCase() === String(c.barcode).toLowerCase());
        if (invItem) {
           let hargaPromo = Number(invItem['Harga Promo']) || 0;
           if (hargaPromo > 0 && hargaPromo < c.price) {
              autoDiscount += (c.price - hargaPromo) * c.qty;
           }
        }
      }
    });

    let discValEl = document.getElementById('discountValue');
    let discTypeEl = document.getElementById('discountType');
    let discVal = Number(discValEl.value) || 0;
    let discType = discTypeEl ? discTypeEl.value : 'override';
    let finalDiscount = 0;

    // --- KUNCI UI & LOGIKA SINGLE DISCOUNT ---
    let promoBadge = document.getElementById('promoIndicatorBadge');

    if (isPromoActive) {
      // Jika Mode Promo ON: Matikan kolom manual & update badge
      if(discTypeEl) discTypeEl.disabled = true;
      if(discValEl) { discValEl.disabled = true; discValEl.value = ''; }
      finalDiscount = autoDiscount;
      
      if (promoBadge) {
        promoBadge.className = "badge bg-warning text-dark";
        promoBadge.innerHTML = "🔥 PROMO ACTIVE";
      }
    } else {
      // Jika Mode Promo OFF: Hidupkan kembali kolom manual & update badge
      if(discTypeEl) discTypeEl.disabled = false;
      if(discValEl) discValEl.disabled = false;
      
      if (promoBadge) {
        promoBadge.className = "badge bg-secondary text-light";
        promoBadge.innerHTML = "MANUAL MODE";
      }
      
      // Logika Diskon Manual Kasir berjalan seperti biasa
      if (discType === 'override' && discVal > 0) { finalDiscount = subtotal - discVal; } 
      else if (discType === 'percent' && discVal > 0) { finalDiscount = subtotal * (discVal / 100); } 
      else if (discType === 'nominal' && discVal > 0) { finalDiscount = discVal; } 
    }

    if (finalDiscount > subtotal) finalDiscount = subtotal;
    if (finalDiscount < 0) finalDiscount = 0;

    let grandTotal = subtotal - finalDiscount;

    // --- PENGAMAN UPDATE TAMPILAN KANAN ---
    try {
      const setUI = (id, val) => { let el = document.getElementById(id); if(el) el.innerText = val; };
      
      // Update Total Qty
      setUI('cartTotalQty', totalQty + ' Pcs'); 
      
      // Update Subtotal (Coba berbagai variasi ID yang mungkin Anda pakai)
      setUI('cartSubtotal', 'Rp ' + subtotal.toLocaleString('id-ID'));
      setUI('subtotalDisplay', 'Rp ' + subtotal.toLocaleString('id-ID'));
      
      // Update Total Kuning Besar
      setUI('cartGrandTotal', 'Rp ' + grandTotal.toLocaleString('id-ID'));
      setUI('grandTotalDisplay', 'Rp ' + grandTotal.toLocaleString('id-ID'));
      setUI('cartTotal', 'Rp ' + grandTotal.toLocaleString('id-ID'));
    } catch(e) { console.log('Abaikan jika ID tidak cocok'); }

    return { sub: subtotal, disc: finalDiscount, grand: grandTotal };
  }
  // ==========================================

  function calculateChangeUI(grandTotal) { const cashGiven = Number(document.getElementById('cashGiven').value) || 0; const changeEl = document.getElementById('changeAmount'); if(cashGiven === 0) { changeEl.innerText = 'Rp 0'; changeEl.className = 'text-success'; return; } const change = cashGiven - grandTotal; if (change < 0) { changeEl.innerText = "Kurang: Rp " + Math.abs(change).toLocaleString('id-ID'); changeEl.className = 'text-danger'; } else { changeEl.innerText = "Rp " + change.toLocaleString('id-ID'); changeEl.className = 'text-success'; } }
  function calculateChange() { calculateTotal(); }
  function setCash(amount) { if(amount === 'pas') { const totals = calculateTotal(); document.getElementById('cashGiven').value = totals.grand; } else { document.getElementById('cashGiven').value = amount; } calculateTotal(); }
  function setDiscount(amount) { document.getElementById('discountValue').value = amount; calculateTotal(); }

  function checkout() {
    if(cart.length === 0) return Swal.fire('Kosong!', 'Keranjang belanja masih kosong.', 'warning');
    if(!selectedPaymentMethod) return Swal.fire('Perhatian Kasir!', 'Metode Pembayaran BELUM DIPILIH! Harap klik salah satu tombol metode bayar di layar.', 'error');
    
    const totals = calculateTotal(); const cashGiven = Number(document.getElementById('cashGiven').value) || 0; let change = 0;
    if(selectedPaymentMethod === 'CASH') { if(cashGiven < totals.grand) return Swal.fire('Uang Kurang!', 'Uang yang diterima kurang dari total belanja.', 'error'); change = cashGiven - totals.grand; }

    Swal.fire({ 
      title: 'Konfirmasi Transaksi', html: `Metode Bayar: <b>${selectedPaymentMethod}</b><br>Diskon: <b>Rp ${totals.disc.toLocaleString('id-ID')}</b><br>Total Bayar: <b class="text-success fs-4">Rp ${totals.grand.toLocaleString('id-ID')}</b>`, icon: 'question', showCancelButton: true, confirmButtonColor: '#F7A600', cancelButtonColor: '#d33', confirmButtonText: 'Ya, Bayar & Print!' 
    }).then((result) => { if (result.isConfirmed) { executeFinalTransaction(totals, cashGiven, change); } });
  }

  function executeFinalTransaction(totals, cashGiven, change) {
    const trxId = 'TRX-' + new Date().getTime();
    const payload = { trxId: trxId, cart: cart, paymentMethod: selectedPaymentMethod, note: selectedPaymentMethod === 'CASH' ? '' : document.getElementById('paymentNote').value, discount: totals.disc, grandTotal: totals.grand };
    
    document.getElementById('printDate').innerText = new Date().toLocaleString('id-ID'); let printCartHtml = '';
    cart.forEach(c => { printCartHtml += `<tr><td>${c.articleName} (${c.size})<br>@Rp${c.price.toLocaleString('id-ID')} x ${c.qty}</td><td style="text-align:right;">Rp${c.subtotal.toLocaleString('id-ID')}</td></tr>`; }); document.getElementById('printCart').innerHTML = printCartHtml; document.getElementById('printSub').innerText = 'Rp ' + totals.sub.toLocaleString('id-ID');
    document.getElementById('printDisc').innerText = 'Rp ' + totals.disc.toLocaleString('id-ID'); document.getElementById('printTotal').innerText = 'Rp ' + totals.grand.toLocaleString('id-ID'); let printPaymentHtml = selectedPaymentMethod;
    if(selectedPaymentMethod === 'CASH') printPaymentHtml += `<br>Cash: Rp ${cashGiven.toLocaleString('id-ID')}<br>Kembali: Rp ${change.toLocaleString('id-ID')}`; document.getElementById('printMethod').innerHTML = printPaymentHtml;
    try { JsBarcode("#printBarcode", trxId, {width: 1.5, height: 40, displayValue: true, fontSize: 12, margin: 0}); } catch(e) {}
    
    if (localStorage.getItem('screamous_autoprint') !== 'false') {
  document.body.classList.add('printing-receipt'); 
  window.print(); 
  setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);
}

    // KODE BARU FASE 3: POTONG STOK LOKAL & UPDATE DISPLAY SEKETIKA
    const updateLocalStockAfterSale = async () => {
      for (const item of cart) {
        let localItem = await db.inventory.get(item.barcode);
        if (localItem) {
          let newStock = (Number(localItem.Stock) || 0) - item.qty;
          await db.inventory.update(item.barcode, { Stock: newStock });
        }
      }
      // Sedot ulang isi database lokal terbaru ke memori aplikasi
      inventoryData = await db.inventory.toArray();
      renderPosList(inventoryData);
      if(typeof loadFreeStuffInventory === 'function') loadFreeStuffInventory();
      if(typeof loadInventoryTable === 'function') loadInventoryTable();
    };

    if (navigator.onLine) {
      google.script.run
        .withFailureHandler(err => { saveToLocalStorage(payload); })
        .withSuccessHandler(async (res) => { 
          await updateLocalStockAfterSale(); // Potong stok lokal dulu
          clearCart(); 
        })
        .processTransaction(payload);
    } else {
      (async () => {
        await updateLocalStockAfterSale(); // Potong stok lokal meskipun internet mati
        saveToLocalStorage(payload);
      })();
    }

  function saveToLocalStorage(payload) {
  let offlineData = JSON.parse(localStorage.getItem('screamous_offline_trx')) || [];
  offlineData.push(payload);
  localStorage.setItem('screamous_offline_trx', JSON.stringify(offlineData));
  clearCart();
  Swal.fire('Mode Darurat Offline', 'Data diamankan di memori laptop. Tekan tombol Sync di atas jika internet kembali normal.', 'warning');
  if (typeof checkOfflineBadge === 'function') checkOfflineBadge(); // <-- Alarm ditambahkan di sini
}

  function checkOfflineBadge() {
    let offlineData = JSON.parse(localStorage.getItem('screamous_offline_trx')) || [];
    const container = document.getElementById('syncBadgeContainer');
    const badge = document.getElementById('syncCountBadge');
    if(container && badge) {
      if (offlineData.length > 0) { badge.innerText = `⚠️ ${offlineData.length} Transaksi Pending`; container.style.display = 'inline-flex'; } 
      else { container.style.display = 'none'; }
    }
  }

  function syncOfflineTransactions() {
    let offlineData = JSON.parse(localStorage.getItem('screamous_offline_trx')) || [];
    if (offlineData.length === 0) return;
    Swal.fire({ title: 'Sinkronisasi...', text: `Mengupload ${offlineData.length} data transaksi ke Google Sheets...`, didOpen: () => { Swal.showLoading(); } });
    
    let promises = offlineData.map(trx => {
      return new Promise((resolve, reject) => {
        google.script.run.withSuccessHandler(res => resolve(res)).withFailureHandler(err => reject(err)).processTransaction(trx);
      });
    });

    Promise.all(promises).then(() => {
      localStorage.removeItem('screamous_offline_trx'); checkOfflineBadge();
      Swal.fire('Sukses Sync!', 'Seluruh data offline berhasil disatukan ke database utama!', 'success');
      if(typeof loadRecap === 'function') loadRecap();
      google.script.run.withSuccessHandler(data => { inventoryData = data; renderPosList(inventoryData); loadInventoryTable(); }).getInventory();
    }).catch(err => { Swal.fire('Sync Gagal', 'Koneksi Sheets terputus tengah jalan, silakan coba lagi!', 'error'); });
  }

 // --- ENGINE UTAMA SETTING STRUK & EXCEL ---
  function applyReceiptSettings() { 
    document.getElementById('pShopName').innerText = currentSettings.shopName; 
    document.getElementById('pEventName').innerText = currentSettings.eventName; 
    document.getElementById('pFooter').innerText = currentSettings.footer; 
    document.getElementById('navBrandText').innerText = currentSettings.shopName + " EVENT"; 
    document.getElementById('pcShopName').innerText = currentSettings.shopName; 
  }
  
  function exportExcel(tableId, filename) {
    if (tableId === 'recapSales') {
        exportDetailedRecapSales(filename);
        return;
    }
    
    let ws_data = [];
    if(tableId === 'inventory') { 
      ws_data.push(['Barcode', 'Article Code', 'Article Name', 'Size', 'Price', 'Stock']); 
      const rows = document.querySelectorAll('#invTableBody tr'); 
      rows.forEach(r => { 
        const cells = r.querySelectorAll('td'); 
        if(cells.length >= 6) ws_data.push([cells[0].innerText, cells[1].innerText, cells[2].innerText, cells[3].innerText, cells[4].innerText, cells[5].innerText]); 
      }); 
    } 
    else if(tableId === 'recapFree') { 
      ws_data.push(['Tanggal Log', 'Article', 'Size', 'Qty', 'Nominal', 'Kategori', 'Catatan']); 
      const rows = document.querySelectorAll('#recapFreeTableBody tr'); 
      rows.forEach(r => { 
        const cells = r.querySelectorAll('td'); 
        if(cells.length >= 7) ws_data.push([cells[0].innerText, cells[1].innerText.replace(/\n/g, ' - '), cells[2].innerText, cells[3].innerText, cells[4].innerText, cells[5].innerText, cells[6].innerText]); 
      }); 
    }
    if(ws_data.length <= 1) return Swal.fire('Kosong!', 'Tidak ada data untuk diekspor.', 'warning'); 
    const ws = XLSX.utils.aoa_to_sheet(ws_data); 
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Data"); 
    XLSX.writeFile(wb, filename + "_" + new Date().toISOString().split('T')[0] + ".xlsx");
  }

  function exportDetailedRecapSales(filename) {
      Swal.fire({ title: 'Menyiapkan Excel...', text: 'Menyusun rincian artikel, mohon tunggu.', didOpen: () => { Swal.showLoading(); }});
      
      const q = document.getElementById('recapSearch').value.toLowerCase().trim(); 
      const startDate = document.getElementById('recapStartDate').value; 
      const endDate = document.getElementById('recapEndDate').value;
      
      const filteredSales = recapData.filter(d => { 
        const matchSearch = String(d[0]).toLowerCase().includes(q); 
        let matchDate = true; 
        if (startDate && endDate && d[1]) { 
            const dDate = new Date(d[1]); 
            if(!isNaN(dDate)) { 
                const sDate = new Date(startDate); sDate.setHours(0,0,0,0); 
                const eDate = new Date(endDate); eDate.setHours(23,59,59,999); 
                matchDate = dDate >= sDate && dDate <= eDate; 
            } 
        } 
        return matchSearch && matchDate; 
      });

      if(filteredSales.length === 0) return Swal.fire('Kosong!', 'Tidak ada data di rentang waktu ini.', 'warning');

      google.script.run.withSuccessHandler(details => {
          let ws_data = [];
          ws_data.push(['LAPORAN DETAIL PENJUALAN']);
          ws_data.push(['Periode:', startDate + ' s/d ' + endDate]);
          ws_data.push([]);
          ws_data.push(['No', 'Trx ID', 'Tanggal', 'Metode Bayar', 'Note', 'Artikel', 'Size', 'Qty', 'Harga', 'Subtotal', 'Diskon Trx', 'Total Bayar Trx']);
          
          let totalKotor = 0; let totalDiskon = 0; let totalBersih = 0; let totalPcs = 0;
          let methodTotals = {};
          let no = 1;

          filteredSales.forEach(sale => {
              const trxId = sale[0];
              const date = new Date(sale[1]).toLocaleString('id-ID');
              const method = sale[2];
              const note = sale[3] ? sale[3] : '-';
              const disc = Number(String(sale[4]).replace(/[^0-9]/g, '')) || 0;
              const grand = Number(String(sale[5]).replace(/[^0-9]/g, '')) || 0;
              const kotor = grand + disc;
              
              totalKotor += kotor; totalDiskon += disc; totalBersih += grand;
              if(!methodTotals[method]) methodTotals[method] = 0;
              methodTotals[method] += grand;

              const trxDetails = details.filter(det => det[0] === trxId);
              
              if(trxDetails.length === 0) {
                  ws_data.push([no, trxId, date, method, note, '-', '-', 0, 0, 0, disc, grand]);
                  no++;
              } else {
                  trxDetails.forEach((det, idx) => {
                      const qty = Number(det[4]) || 0;
                      const price = Number(String(det[5]).replace(/[^0-9]/g, '')) || 0;
                      const sub = Number(String(det[6]).replace(/[^0-9]/g, '')) || 0;
                      totalPcs += qty;
                      
                      ws_data.push([
                          (idx === 0) ? no : '', 
                          (idx === 0) ? trxId : '', 
                          (idx === 0) ? date : '', 
                          (idx === 0) ? method : '', 
                          (idx === 0) ? note : '', 
                          det[2], det[3], qty, price, sub, 
                          (idx === 0) ? disc : '', 
                          (idx === 0) ? grand : ''
                      ]);
                  });
                  no++;
              }
          });

          ws_data.push([]); ws_data.push(['RINGKASAN TOTAL']);
          ws_data.push(['Total Artikel Terjual:', totalPcs + ' Pcs']);
          ws_data.push(['Penjualan Kotor:', totalKotor]);
          ws_data.push(['Diskon Diberikan:', totalDiskon]);
          ws_data.push(['Penjualan Bersih:', totalBersih]);
          ws_data.push([]); ws_data.push(['RINCIAN METODE PEMBAYARAN']);
          for(let m in methodTotals) { ws_data.push([m, methodTotals[m]]); }

          const ws = XLSX.utils.aoa_to_sheet(ws_data); 
          const wb = XLSX.utils.book_new(); 
          XLSX.utils.book_append_sheet(wb, ws, "Rekap Detail"); 
          XLSX.writeFile(wb, filename + "_Detail_" + new Date().toISOString().split('T')[0] + ".xlsx");
          Swal.close();
      }).getTrxDetails('');
  }

  function printRecapData() { 
      Swal.fire({ title: 'Menyiapkan Cetakan...', text: 'Merapikan format rincian artikel...', didOpen: () => { Swal.showLoading(); }});
      
      const q = document.getElementById('recapSearch').value.toLowerCase().trim(); 
      const startDate = document.getElementById('recapStartDate').value; 
      const endDate = document.getElementById('recapEndDate').value;

      const filteredSales = recapData.filter(d => { 
        const matchSearch = String(d[0]).toLowerCase().includes(q); 
        let matchDate = true; 
        if (startDate && endDate && d[1]) { 
            const dDate = new Date(d[1]); 
            if(!isNaN(dDate)) { 
                const sDate = new Date(startDate); sDate.setHours(0,0,0,0); 
                const eDate = new Date(endDate); eDate.setHours(23,59,59,999); 
                matchDate = dDate >= sDate && dDate <= eDate; 
            } 
        } 
        return matchSearch && matchDate; 
      });

      if(filteredSales.length === 0) return Swal.fire('Kosong!', 'Tidak ada data untuk dicetak.', 'warning');

      google.script.run.withSuccessHandler(details => {
          let totalKotor = 0; let totalDiskon = 0; let totalBersih = 0; let totalPcs = 0;
          let methodTotals = {};
          let tbodyHtml = ''; let no = 1;
          
          filteredSales.forEach(sale => {
              const trxId = sale[0];
              const date = new Date(sale[1]).toLocaleString('id-ID');
              const method = sale[2];
              const note = sale[3] ? sale[3] : '-';
              const disc = Number(String(sale[4]).replace(/[^0-9]/g, '')) || 0;
              const grand = Number(String(sale[5]).replace(/[^0-9]/g, '')) || 0;
              const kotor = grand + disc;
              
              totalKotor += kotor; totalDiskon += disc; totalBersih += grand;
              if(!methodTotals[method]) methodTotals[method] = 0;
              methodTotals[method] += grand;

              const trxDetails = details.filter(det => det[0] === trxId);
              
              if(trxDetails.length > 0) {
                 tbodyHtml += `<tr class="trx-header">
                    <td>${no}</td>
                    <td><strong>${trxId}</strong><br><small style="font-weight:normal;">${date}</small></td>
                    <td>${method}<br><small style="font-weight:normal;">Note: ${note}</small></td>
                    <td>Rp ${disc.toLocaleString('id-ID')}</td>
                    <td><strong>Rp ${grand.toLocaleString('id-ID')}</strong></td>
                 </tr>`;
                 
                 tbodyHtml += `<tr><td colspan="5" class="p-0">
                    <table class="detail-table">
                        <tr><th>Artikel</th><th>Size</th><th>Qty</th><th>Subtotal</th></tr>`;
                 
                 trxDetails.forEach(det => {
                     const qty = Number(det[4]) || 0;
                     const sub = Number(String(det[6]).replace(/[^0-9]/g, '')) || 0;
                     totalPcs += qty;
                     tbodyHtml += `<tr>
                        <td>${det[2]}</td>
                        <td>${det[3]}</td>
                        <td>${qty}</td>
                        <td>Rp ${sub.toLocaleString('id-ID')}</td>
                     </tr>`;
                 });
                 tbodyHtml += `</table></td></tr>`;
                 no++;
              }
          });

          let methodHtml = '';
          for(let m in methodTotals) {
              methodHtml += `<tr><td>${m}</td><td style="text-align:right; font-weight:bold;">Rp ${methodTotals[m].toLocaleString('id-ID')}</td></tr>`;
          }

          const printWindow = window.open('', '_blank', 'width=1000,height=800'); 
          if (!printWindow) {
              Swal.fire('Pop-up Terblokir!', 'Browser memblokir jendela Print. Harap izinkan pop-up (Always allow pop-ups).', 'warning');
              return;
          }
          
          printWindow.document.write(`<html><head><title>Print Detail Rekap Penjualan</title><style>
            body{padding:20px;font-family:sans-serif;color:black;background:white;font-size:12px;}
            h3{text-align:center;margin-bottom:5px;font-weight:bold;}
            .summary-box{display:flex;justify-content:space-between;border:1px solid #000;padding:15px;margin-bottom:20px;background:#f9f9f9;}
            .summary-col{flex:1;}
            table{width:100%;border-collapse:collapse;margin-bottom:10px;}
            th,td{border:1px solid #000;padding:6px;text-align:left;vertical-align:top;}
            th{background-color:#e0e0e0;}
            .trx-header{background-color:#f2f2f2;}
            .detail-table{width:90%;float:right;margin:4px 0 10px 0;border:1px dashed #999;background:#fff;}
            .detail-table th, .detail-table td{border:1px dashed #ccc;padding:4px;}
            .detail-table th{background-color:#fafafa;}
          </style></head><body>
            <h3>LAPORAN RINCIAN PENJUALAN</h3>
            <p style="text-align:center;">Periode: ${startDate} s/d ${endDate}</p>
            
            <div class="summary-box">
               <div class="summary-col">
                  <strong style="font-size:14px;">RINGKASAN TOTAL</strong><br><br>
                  Total Artikel Terjual: <strong style="font-size:14px;">${totalPcs} Pcs</strong><br>
                  Penjualan Kotor: Rp ${totalKotor.toLocaleString('id-ID')}<br>
                  Diskon Diberikan: Rp ${totalDiskon.toLocaleString('id-ID')}<br>
                  <strong style="font-size:14px; color:#c00;">Penjualan Bersih: Rp ${totalBersih.toLocaleString('id-ID')}</strong>
               </div>
               <div class="summary-col">
                  <strong style="font-size:14px;">METODE PEMBAYARAN</strong><br><br>
                  <table style="width:80%; border:none; margin:0; background:transparent;">
                     ${methodHtml}
                  </table>
               </div>
            </div>

            <table>
              <thead>
                 <tr><th>No</th><th>Trx ID & Tanggal</th><th>Pembayaran & Note</th><th>Diskon</th><th>Total Bayar</th></tr>
              </thead>
              <tbody>
                 ${tbodyHtml}
              </tbody>
            </table>
            
            <script>setTimeout(()=>{window.print();window.close();},1500);<\/script>
          </body></html>`); 
          printWindow.document.close(); 
          Swal.close();
      }).getTrxDetails('');
  }

  function printInventoryData() { 
    const printWindow = window.open('', '_blank', 'width=900,height=700'); 
    if (!printWindow) {
      Swal.fire('Pop-up Terblokir!', 'Harap aktifkan izin pop-up pada browser Anda.', 'warning');
      return;
    }
    const tempDiv = document.createElement('div'); 
    tempDiv.innerHTML = document.querySelector('#inventoryPage .table-responsive').innerHTML; 
    tempDiv.querySelectorAll('th:last-child, td:last-child').forEach(el => el.remove()); 
    const tableHtml = tempDiv.innerHTML; 
    const totalBadge = document.getElementById('invTotalBadge').innerText; 
    printWindow.document.write(`<html><head><title>Print Inventory</title><style>body{padding:30px;font-family:sans-serif;color:black;background:white;}h3{text-align:center;margin-bottom:5px;font-weight:bold;}.summary{text-align:center;margin-bottom:20px;font-size:1.1rem;padding-bottom:10px;border-bottom:2px dashed #ccc;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #000;padding:8px;text-align:left;}th{background-color:#f2f2f2;}a,span{text-decoration:none !important;color:black !important;}</style></head><body><h3>INVENTORY DATABASE</h3><div class="summary">${totalBadge}</div>${tableHtml}<script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`); 
    printWindow.document.close(); 
  }

  // --- ENGINE FREE STUFF ---
  function loadFreeStuffInventory() { const list = document.getElementById('freeInventoryList'); if (!list) return; list.innerHTML = ''; inventoryData.forEach(item => { const isOutOfStock = item.Stock <= 0; const stockBadge = isOutOfStock ? `<span class="badge bg-danger rounded-pill">Habis</span>` : `<span class="badge bg-success rounded-pill">Stok: ${item.Stock}</span>`; list.innerHTML += `<button type="button" class="list-group-item list-group-item-action bg-dark text-light border-secondary d-flex justify-content-between align-items-center" ${isOutOfStock ? 'disabled' : ''} ondblclick="searchFreeItem('${item.Barcode}')"><div class="text-start"><div class="fw-bold" style="font-size: 0.9rem;">${item['Article Name']}</div><small class="text-warning" style="font-size: 0.8rem;">${item['Article Code']} | Size: ${item.Size}</small></div>${stockBadge}</button>`; }); }
  function filterFreePosList() { const q = document.getElementById('freeFilterList').value.toLowerCase(); const filtered = inventoryData.filter(i => String(i.Barcode || '').toLowerCase().includes(q) || String(i['Article Code'] || '').toLowerCase().includes(q) || String(i['Article Name'] || '').toLowerCase().includes(q)); const list = document.getElementById('freeInventoryList'); list.innerHTML = ''; filtered.forEach(item => { const isOutOfStock = item.Stock <= 0; const stockBadge = isOutOfStock ? `<span class="badge bg-danger rounded-pill">Habis</span>` : `<span class="badge bg-success rounded-pill">Stok: ${item.Stock}</span>`; list.innerHTML += `<button type="button" class="list-group-item list-group-item-action bg-dark text-light border-secondary d-flex justify-content-between align-items-center" ${isOutOfStock ? 'disabled' : ''} ondblclick="searchFreeItem('${item.Barcode}')"><div class="text-start"><div class="fw-bold" style="font-size: 0.9rem;">${item['Article Name']}</div><small class="text-warning" style="font-size: 0.8rem;">${item['Article Code']} | Size: ${item.Size}</small></div>${stockBadge}</button>`; }); }
  function searchFreeItem(query) { if(!query) return; const q = String(query).toLowerCase(); let item = inventoryData.find(i => String(i.Barcode || '').toLowerCase() === q); if(!item) item = inventoryData.find(i => String(i['Article Code'] || '').toLowerCase() === q || String(i['Article Name'] || '').toLowerCase().includes(q)); if(item) { if(item.Stock <= 0) { Swal.fire('Stok Habis!', 'Item ini sudah tidak tersedia.', 'error'); return; } let freeItem = freeCart.find(c => c.barcode === item.Barcode); if(freeItem) { freeItem.qty++; freeItem.subtotal = freeItem.qty * freeItem.price; } else { freeCart.push({ barcode: item.Barcode, articleName: item['Article Name'], size: item.Size, price: Number(item.Price), qty: 1, subtotal: Number(item.Price) }); } renderFreeCart(); } else Swal.fire('Oops!', 'Item tidak ditemukan di inventory.', 'warning'); }
  function renderFreeCart() { const tbody = document.getElementById('freeCartTableBody'); tbody.innerHTML = ''; freeCart.forEach((c, index) => { tbody.innerHTML += `<tr><td class="text-info">${c.articleName}</td><td>${c.size}</td><td>Rp ${c.price.toLocaleString('id-ID')}</td><td><input type="number" class="form-control form-control-sm w-50 bg-dark text-success border-success" value="${c.qty}" onchange="updateFreeQty(${index}, this.value)"></td><td class="text-warning">Rp ${c.subtotal.toLocaleString('id-ID')}</td><td><button class="btn btn-sm btn-outline-danger" onclick="removeFreeCart(${index})">X</button></td></tr>`; }); calculateFreeTotal(); }
  function updateFreeQty(index, val) { if(val <= 0) removeFreeCart(index); else { freeCart[index].qty = Number(val); freeCart[index].subtotal = freeCart[index].qty * freeCart[index].price; renderFreeCart(); } }
  function removeFreeCart(index) { freeCart.splice(index, 1); renderFreeCart(); }
  function clearFreeCart() { freeCart = []; document.getElementById('freeNote').value = ''; renderFreeCart(); }
  function calculateFreeTotal() { let totalQty = freeCart.reduce((sum, item) => sum + item.qty, 0); let totalNominal = freeCart.reduce((sum, item) => sum + item.subtotal, 0); document.getElementById('freeTotalQty').innerText = totalQty + ' Pcs'; document.getElementById('freeTotalNominal').innerText = 'Rp ' + totalNominal.toLocaleString('id-ID'); }
  function checkoutFreeStuff() { if(freeCart.length === 0) return Swal.fire('Kosong!', 'Keranjang Free Stuff masih kosong!', 'warning'); const note = document.getElementById('freeNote').value.trim(); const category = document.getElementById('freeCategory').value; if(!note) return Swal.fire('Oops!', 'Catatan Alasan (Note) WAJIB diisi sebelum memproses!', 'warning'); const payload = { cart: freeCart, category: category, note: note }; google.script.run.withFailureHandler(err => Swal.fire('Gagal', err.message, 'error')).withSuccessHandler(res => { Swal.fire('Sukses!', res.message, 'success'); clearFreeCart(); google.script.run.withSuccessHandler(data => { inventoryData = data; loadFreeStuffInventory(); loadInventoryTable(); }).getInventory(); }).processFreeStuffBatch(payload); }

  // --- ENGINE REKAP FREE STUFF ---
  function loadFreeStuffLogTable() { const tbody = document.getElementById('recapFreeTableBody'); tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Memuat data histori...</td></tr>'; google.script.run.withFailureHandler(err => { tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Gagal memuat: ${err.message}</td></tr>`; }).withSuccessHandler(logs => { freeLogData = logs; filterFreeLog(); }).getFreeStuffLog(); }
  function filterFreeLog() { const startDate = document.getElementById('rfStartDate').value; const endDate = document.getElementById('rfEndDate').value; const tbody = document.getElementById('recapFreeTableBody'); tbody.innerHTML = ''; const filtered = freeLogData.filter(row => { let matchDate = true; if (startDate && endDate && row[0]) { const dDate = new Date(row[0]); if(!isNaN(dDate)) { const sDate = new Date(startDate); sDate.setHours(0,0,0,0); const eDate = new Date(endDate); eDate.setHours(23,59,59,999); matchDate = dDate >= sDate && dDate <= eDate; } } return matchDate; }); if(filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Belum ada data di rentang waktu ini.</td></tr>'; document.getElementById('rfTotalQtyBadge').innerText = '0 Pcs'; document.getElementById('rfTotalNominalBadge').innerText = 'Rp 0'; return; } let totalQty = 0; let totalNominal = 0; filtered.reverse().forEach(row => { totalQty += Number(row[4]) || 0; let nominal = row[5]; let cleanNom = Number(String(nominal).replace(/[^0-9]/g, '')) || 0; totalNominal += cleanNom; if(!String(nominal).includes('Rp')) nominal = 'Rp ' + cleanNom.toLocaleString('id-ID'); let displayDate = "-"; let dateObj = new Date(row[0]); if(!isNaN(dateObj)) displayDate = dateObj.toLocaleString('id-ID'); tbody.innerHTML += `<tr><td><small class="text-muted">${displayDate}</small></td><td><strong>${row[2]}</strong><br><small class="text-warning">${row[1]}</small></td><td>${row[3]}</td><td class="text-success fw-bold">${row[4]}</td><td class="text-warning">${nominal}</td><td><span class="badge bg-info text-dark">${row[6]}</span></td><td><small>${row[7]}</small></td></tr>`; }); document.getElementById('rfTotalQtyBadge').innerText = totalQty + ' Pcs'; document.getElementById('rfTotalNominalBadge').innerText = 'Rp ' + totalNominal.toLocaleString('id-ID'); }

  // --- ENGINE REKAP PENJUALAN ---
  function loadRecap() { const tbody = document.getElementById('recapTableBody'); tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Memuat data rekap...</td></tr>'; google.script.run.withFailureHandler(err => { tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Gagal memuat: ${err.message}</td></tr>`; }).withSuccessHandler(res => { recapData = res.salesData; filterRecap(); }).getSalesRecap(); }
  
  function filterRecap() { 
    const q = document.getElementById('recapSearch').value.toLowerCase().trim(); 
    const startDate = document.getElementById('recapStartDate').value; 
    const endDate = document.getElementById('recapEndDate').value;
    const filtered = recapData.filter(d => { 
        const matchSearch = String(d[0]).toLowerCase().includes(q); 
        let matchDate = true; 
        if (startDate && endDate && d[1]) { 
            const dDate = new Date(d[1]); 
            if(!isNaN(dDate)) { 
                const sDate = new Date(startDate); sDate.setHours(0,0,0,0); 
                const eDate = new Date(endDate); eDate.setHours(23,59,59,999); 
                matchDate = dDate >= sDate && dDate <= eDate; 
            } 
        } 
        return matchSearch && matchDate; 
    });
    const tbody = document.getElementById('recapTableBody'); 
    tbody.innerHTML = ''; 
    if(filtered.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada transaksi.</td></tr>'; 
        document.getElementById('recapQtyBadge').innerText = '0 Pcs'; document.getElementById('recapTrxBadge').innerText = '0 Trx'; document.getElementById('recapTotalBadge').innerText = 'Total: Rp 0'; 
        return; 
    } 
    let totalRevenue = 0; let totalTrx = filtered.length; let totalFilteredQty = 0; 
    filtered.forEach((d, index) => { 
        let totalDisplay = d[5]; let cleanVal = Number(String(totalDisplay).replace(/[^0-9]/g, '')); 
        totalRevenue += cleanVal; totalFilteredQty += Number(d[6]) || 0; 
        if(!String(totalDisplay).includes('Rp')) totalDisplay = 'Rp ' + cleanVal.toLocaleString('id-ID'); 
        let displayDate = "-"; let dateObj = new Date(d[1]); 
        if(!isNaN(dateObj)) displayDate = dateObj.toLocaleDateString('id-ID'); 
        
        let noteText = d[3] ? d[3] : '-'; 
        let safeNote = String(noteText).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        
        tbody.innerHTML += `<tr><td>${index + 1}</td><td><span class="text-warning fw-bold text-decoration-underline" style="cursor:pointer;" onclick="showTrxDetail('${d[0]}', '${d[2]}', '${d[4]}', '${d[5]}', '${safeNote}')">${d[0]}</span></td><td>${displayDate}</td><td>${d[2]}</td><td>${noteText}</td><td>${totalDisplay}</td></tr>`; 
    });
    document.getElementById('recapTrxBadge').innerText = totalTrx + ' Trx'; 
    document.getElementById('recapTotalBadge').innerText = 'Total: Rp ' + totalRevenue.toLocaleString('id-ID'); 
    document.getElementById('recapQtyBadge').innerText = totalFilteredQty + ' Pcs';
  }

  window.showTrxDetail = function(trxId, method, discount, grandTotal, note) { 
    try { 
        const modalEl = document.getElementById('detailModal'); 
        let modal = bootstrap.Modal.getOrCreateInstance(modalEl); 
        modal.show();
        document.getElementById('detailContent').style.display = 'none'; 
        document.getElementById('detailLoading').style.display = 'block'; 
        document.getElementById('dtTrxId').innerText = trxId; 
        document.getElementById('dtMethod').innerText = method;
        
        if (note && note !== '-' && note !== 'undefined') {
            document.getElementById('dtNoteWrapper').style.display = 'block';
            document.getElementById('dtNote').innerText = note;
        } else {
            document.getElementById('dtNoteWrapper').style.display = 'none';
        }

        const cleanNum = (str) => Number(String(str || '0').replace(/[^0-9]/g, '')); 
        google.script.run.withSuccessHandler(details => { 
            document.getElementById('detailLoading').style.display = 'none'; 
            document.getElementById('detailContent').style.display = 'block'; 
            const tbody = document.getElementById('dtTableBody'); 
            tbody.innerHTML = ''; let subtotalBeforeDisc = 0; 
            details.forEach(item => { 
                let price = cleanNum(item[5]), qty = cleanNum(item[4]), subtotal = cleanNum(item[6]); 
                subtotalBeforeDisc += subtotal; 
                tbody.innerHTML += `<tr><td><small class="text-muted">${item[1]}</small></td><td>${item[2]}</td><td>${item[3]}</td><td>${qty}</td><td>Rp ${price.toLocaleString('id-ID')}</td><td>Rp ${subtotal.toLocaleString('id-ID')}</td></tr>`; 
            }); 
            document.getElementById('dtSubtotal').innerText = 'Rp ' + subtotalBeforeDisc.toLocaleString('id-ID'); 
            document.getElementById('dtDiscount').innerText = 'Rp ' + cleanNum(discount).toLocaleString('id-ID'); 
            document.getElementById('dtGrandTotal').innerText = 'Rp ' + cleanNum(grandTotal).toLocaleString('id-ID'); 
        }).getTrxDetails(trxId);
    } catch (e) { Swal.fire('Error', e.message, 'error'); } 
  };

  function printRecapData() { 
      const printWindow = window.open('', '_blank', 'width=900,height=700'); 
      if (!printWindow) {
          Swal.fire('Pop-up Terblokir!', 'Browser memblokir jendela Print. Harap izinkan pop-up (Always allow pop-ups) pada browser Anda.', 'warning');
          return;
      }
      const tableHtml = document.querySelector('#recapPage .table-responsive').innerHTML;
      const totalBadge = document.getElementById('recapTotalBadge').innerText; 
      const qtyBadge = document.getElementById('recapQtyBadge').innerText; 
      const trxBadge = document.getElementById('recapTrxBadge').innerText;
      printWindow.document.write(`<html><head><title>Print Rekap Penjualan</title><style>body{padding:30px;font-family:sans-serif;color:black;background:white;}h3{text-align:center;margin-bottom:5px;font-weight:bold;}.summary{text-align:center;margin-bottom:20px;font-size:1.1rem;padding-bottom:10px;border-bottom:2px dashed #ccc;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #000;padding:8px;text-align:left;}th{background-color:#f2f2f2;}a,span{text-decoration:none !important;color:black !important;}</style></head><body><h3>REKAP PENJUALAN HARIAN</h3><div class="summary">${totalBadge} | ${qtyBadge} | ${trxBadge}</div>${tableHtml}<script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`); 
      printWindow.document.close(); 
  }

  // --- ENGINE CLOSING HARIAN ---
  function loadClosingData() { const cDateStr = document.getElementById('closingDateInput').value; if(!cDateStr) return; google.script.run.withFailureHandler(err => Swal.fire("Gagal", err.message, "error")).withSuccessHandler(res => { const allSales = res.salesData; let gross = 0; let disc = 0; let net = 0; let mCash = 0; let mCard = 0; let mQris = 0; let mTransfer = 0; let totalQty = 0; const sDate = new Date(cDateStr); sDate.setHours(0,0,0,0); const eDate = new Date(cDateStr); eDate.setHours(23,59,59,999); google.script.run.withFailureHandler(err => Swal.fire("Gagal", err.message, "error")).withSuccessHandler(details => { allSales.forEach(sale => { const dDate = new Date(sale[1]); if(!isNaN(dDate) && dDate >= sDate && dDate <= eDate) { const trxId = sale[0]; const method = String(sale[2]).toUpperCase(); const discount = Number(String(sale[4]).replace(/[^0-9]/g, '')) || 0; const grand = Number(String(sale[5]).replace(/[^0-9]/g, '')) || 0; const subtotal = grand + discount; gross += subtotal; disc += discount; net += grand; if(method === 'CASH') mCash += grand; else if(method === 'CARD') mCard += grand; else if(method === 'QRIS') mQris += grand; else if(method === 'TRANSFER') mTransfer += grand; details.forEach(det => { if(det[0] === trxId) { totalQty += Number(det[4]) || 0; } }); } }); document.getElementById('closeGross').innerText = 'Rp ' + gross.toLocaleString('id-ID'); document.getElementById('closeDisc').innerText = 'Rp ' + disc.toLocaleString('id-ID'); document.getElementById('closeNet').innerText = 'Rp ' + net.toLocaleString('id-ID'); document.getElementById('closeQty').innerText = totalQty + ' Pcs'; document.getElementById('closeCash').innerText = 'Rp ' + mCash.toLocaleString('id-ID'); document.getElementById('closeCard').innerText = 'Rp ' + mCard.toLocaleString('id-ID'); document.getElementById('closeQris').innerText = 'Rp ' + mQris.toLocaleString('id-ID'); document.getElementById('closeTransfer').innerText = 'Rp ' + mTransfer.toLocaleString('id-ID'); window.closingPrintData = { date: cDateStr, qty: totalQty, gross: gross, disc: disc, net: net, cash: mCash, card: mCard, qris: mQris, transfer: mTransfer }; }).getTrxDetails(''); }).getSalesRecap(); }
  function printClosingReport() { if(!window.closingPrintData) return Swal.fire('Perhatian', 'Silakan muat data closing terlebih dahulu!', 'warning'); const d = window.closingPrintData; document.getElementById('pcDateTitle').innerText = "Tanggal: " + new Date(d.date).toLocaleDateString('id-ID'); document.getElementById('pcPrintDate').innerText = new Date().toLocaleString('id-ID'); document.getElementById('pcQty').innerText = d.qty + " Pcs"; document.getElementById('pcGross').innerText = "Rp " + d.gross.toLocaleString('id-ID'); document.getElementById('pcDisc').innerText = "Rp " + d.disc.toLocaleString('id-ID'); document.getElementById('pcNet').innerText = "Rp " + d.net.toLocaleString('id-ID'); document.getElementById('pcCash').innerText = "Rp " + d.cash.toLocaleString('id-ID'); document.getElementById('pcCard').innerText = "Rp " + d.card.toLocaleString('id-ID'); document.getElementById('pcQris').innerText = "Rp " + d.qris.toLocaleString('id-ID'); document.getElementById('pcTransfer').innerText = "Rp " + d.transfer.toLocaleString('id-ID'); document.body.classList.add('printing-closing'); window.print(); setTimeout(() => document.body.classList.remove('printing-closing'), 1000); }

  // --- FITUR RESTOCK CEPAT ---
  function openRestockModal(barcode) { const modal = new bootstrap.Modal(document.getElementById('restockModal')); modal.show(); document.getElementById('rsBarcode').value = barcode; findRestockItem(barcode); }
  function findRestockItem(barcode) { const item = inventoryData.find(i => String(i.Barcode || '').toLowerCase() === String(barcode).trim().toLowerCase()); if(item) { document.getElementById('rsName').value = item['Article Name'] + ' (Sz: ' + item.Size + ')'; document.getElementById('btnSubmitRestock').disabled = false; document.getElementById('rsQty').focus(); } else { document.getElementById('rsName').value = 'TIDAK DITEMUKAN!'; document.getElementById('btnSubmitRestock').disabled = true; } }
  function submitRestock() { 
  const barcode = document.getElementById('rsBarcode').value.trim(); 
  const qtyInput = document.getElementById('rsQty'); // <-- HURUF Q BESAR
  
  // Pengaman: Pastikan input ditemukan sebelum dibaca nilainya
  if (!qtyInput) {
    console.error("Elemen rsQty tidak ditemukan!");
    return;
  }
  
  // Pengaman: Pastikan input ditemukan sebelum dibaca nilainya
  if (!qtyInput) {
    console.error("Elemen rsqty tidak ditemukan!");
    return;
  }
  
  const qty = parseInt(qtyInput.value) || 0; 
  const btn = document.getElementById('btnSubmitRestock'); 
  
  if(qty <= 0) {
    Swal.fire('Oops!', 'Kuantitas harus lebih dari 0!', 'warning');
    return;
  }

  btn.innerHTML = 'Loading...'; 
  btn.disabled = true; 
  
  google.script.run
    .withFailureHandler(err => { 
      Swal.fire('Gagal', err.message, 'error'); 
      btn.innerHTML = 'Simpan Restock'; 
      btn.disabled = false; 
    })
    .withSuccessHandler(res => { 
      Swal.fire('Berhasil!', 'Stok ' + res.name + ' telah diperbarui. Total: ' + res.newStock, 'success'); 
      document.getElementById('rsBarcode').value = ''; 
      document.getElementById('rsName').value = ''; 
      qtyInput.value = ''; // Menggunakan variabel qtyInput yang sudah aman
      btn.innerHTML = 'Simpan Restock'; 
      btn.disabled = false;
      
      google.script.run
        .withSuccessHandler(data => { 
          inventoryData = data; 
          if(typeof loadInventoryTable === 'function') loadInventoryTable(); 
          if(typeof loadFreeStuffInventory === 'function') loadFreeStuffInventory(); 
        })
        .getInventory(); 
        
      const modalEl = document.getElementById('restockModal'); 
      const modalInstance = bootstrap.Modal.getInstance(modalEl); 
      if(modalInstance) modalInstance.hide(); 
    })
    .processQuickRestock(barcode, qty); 
}
  function loadSettingsForm() { document.getElementById('setShopName').value = currentSettings.shopName; document.getElementById('setEventName').value = currentSettings.eventName; document.getElementById('setFooter').value = currentSettings.footer; }
  function submitSettings() { 
  const payload = { 
    shopName: document.getElementById('setShopName').value.trim(), 
    eventName: document.getElementById('setEventName').value.trim(), 
    footer: document.getElementById('setFooter').value.trim(),
    keyCash: currentSettings.keyCash,
    keyQris: currentSettings.keyQris,
    keyCard: currentSettings.keyCard,
    keyTransfer: currentSettings.keyTransfer
  }; 
  if(!payload.shopName) return Swal.fire('Oops!', 'Nama toko kosong!', 'warning'); 
  google.script.run.withSuccessHandler(res => { Swal.fire('Sukses!', res, 'success'); currentSettings = payload; applyReceiptSettings(); showPage('posPage'); }).saveSettings(payload); 
}
  
  function loadArticleDropdown() { const select = document.getElementById('iSelectArticle'); select.innerHTML = '<option value="">-- Buat Artikel Baru (Ketik Manual) --</option>'; const unique = []; const map = new Map(); for (const item of inventoryData) { if(item['Article Code'] && !map.has(item['Article Code'])) { map.set(item['Article Code'], true); unique.push({ code: item['Article Code'], name: item['Article Name'], price: item['Price'] }); } } unique.forEach(a => { select.innerHTML += `<option value="${a.code}|${a.name}|${a.price}">${a.code} - ${a.name}</option>`; }); }
  function fillFromDropdown() { const val = document.getElementById('iSelectArticle').value; const codeEl = document.getElementById('iArtCode'); const nameEl = document.getElementById('iArtName'); const priceEl = document.getElementById('iPrice'); if(val) { const parts = val.split('|'); codeEl.value = parts[0]; nameEl.value = parts[1]; priceEl.value = parts[2]; codeEl.readOnly = true; nameEl.readOnly = true; priceEl.readOnly = true; codeEl.classList.add('bg-secondary'); nameEl.classList.add('bg-secondary'); priceEl.classList.add('bg-secondary'); document.getElementById('iSize').focus(); } else { codeEl.value = ''; nameEl.value = ''; priceEl.value = ''; codeEl.readOnly = false; nameEl.readOnly = false; priceEl.readOnly = false; codeEl.classList.remove('bg-secondary'); nameEl.classList.remove('bg-secondary'); priceEl.classList.remove('bg-secondary'); } }
  function renderPosList(data) { const list = document.getElementById('posInventoryList'); if (!list) return; list.innerHTML = ''; data.forEach(item => { const isOutOfStock = item.Stock <= 0; const stockBadge = isOutOfStock ? `<span class="badge bg-danger rounded-pill">Habis</span>` : `<span class="badge bg-success rounded-pill">Stok: ${item.Stock}</span>`; list.innerHTML += `<button type="button" class="list-group-item list-group-item-action bg-dark text-light border-secondary d-flex justify-content-between align-items-center" ${isOutOfStock ? 'disabled' : ''} ondblclick="searchItem('${item.Barcode}')"><div class="text-start"><div class="fw-bold" style="font-size: 0.9rem;">${item['Article Name']}</div><small class="text-warning" style="font-size: 0.8rem;">${item['Article Code']} | Size: ${item.Size}</small></div>${stockBadge}</button>`; }); }
  function filterPosList() { const q = document.getElementById('posFilterList').value.toLowerCase(); const filtered = inventoryData.filter(i => String(i.Barcode || '').toLowerCase().includes(q) || String(i['Article Code'] || '').toLowerCase().includes(q) || String(i['Article Name'] || '').toLowerCase().includes(q)); renderPosList(filtered); }
  function voidTransaction() { const trxId = document.getElementById('dtTrxId').innerText; Swal.fire({ title: 'VOID Transaksi?', text: `Anda yakin ingin me-VOID transaksi ${trxId}? Stok akan dikembalikan otomatis.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Ya, VOID Transaksi!' }).then((result) => { if (result.isConfirmed) { const modal = bootstrap.Modal.getInstance(document.getElementById('detailModal')); if(modal) modal.hide(); google.script.run.withSuccessHandler(res => { Swal.fire('Terhapus!', res, 'success'); loadRecap(); google.script.run.withSuccessHandler(data => { inventoryData = data; renderPosList(inventoryData); loadFreeStuffInventory(); loadInventoryTable(); }).getInventory(); }).processVoid(trxId); } }) }
  function submitInventory() { const btnSubmit = document.querySelector('#inputForm button[type="submit"]'); btnSubmit.innerHTML = 'Menyimpan...'; btnSubmit.disabled = true; const item = { barcode: document.getElementById('iBarcode').value, articleCode: document.getElementById('iArtCode').value, articleName: document.getElementById('iArtName').value, size: document.getElementById('iSize').value, price: document.getElementById('iPrice').value, stock: document.getElementById('iStock').value }; google.script.run.withFailureHandler(err => { Swal.fire('Error', err.message, 'error'); btnSubmit.innerHTML = 'Simpan ke Inventory'; btnSubmit.disabled = false; }).withSuccessHandler(res => { Swal.fire('Berhasil!', res.message, 'success'); document.getElementById('inputForm').reset(); btnSubmit.innerHTML = 'Simpan ke Inventory'; btnSubmit.disabled = false; google.script.run.withSuccessHandler(data => { inventoryData = data; loadInventoryTable(); loadFreeStuffInventory(); }).getInventory(); }).addInventory(item); }
  function loadInventoryTable() { renderInv(inventoryData); }
  function filterInventory() { const q = document.getElementById('invSearch').value.toLowerCase(); const filtered = inventoryData.filter(i => String(i.Barcode || '').toLowerCase().includes(q) || String(i['Article Code'] || '').toLowerCase().includes(q) || String(i['Article Name'] || '').toLowerCase().includes(q)); renderInv(filtered); }
  function renderInv(data) {
    const tbody = document.getElementById('invTableBody');
    tbody.innerHTML = '';
    let totalPcs = 0;
    data.forEach(d => {
      totalPcs += Number(d.Stock) || 0;
      
      // Mengambil nilai Harga Promo dari urutan database kolom ke-7 (index ke-6)
      let rawPromo = d[6] || d['Harga Promo'];
      let promoDisplay = (rawPromo && Number(rawPromo) > 0) ? 'Rp ' + Number(rawPromo).toLocaleString('id-ID') : '<span class="text-muted">-</span>';
      
      tbody.innerHTML += `<tr>
        <td>${d.Barcode}</td>
        <td>${d['Article Code']}</td>
        <td>${d['Article Name']}</td>
        <td>${d.Size}</td>
        <td>Rp ${Number(d.Price).toLocaleString('id-ID')}</td>
        <td class="text-info fw-bold">${promoDisplay}</td>
        <td>${d.Stock}</td>
        <td>
          <button class="btn btn-sm btn-outline-warning py-0 px-2" onclick="openRestockModal('${d.Barcode}')" style="font-size: 11px;" title="Tambah Stok"><i class="bi bi-box-arrow-in-down"></i> +Stok</button>
          <button class="btn btn-sm btn-outline-info py-0 px-2 ms-1" onclick="openPromoModal('${d.Barcode}', '${d['Article Name']}', '${rawPromo || ''}')" style="font-size: 11px;" title="Set Promo"><i class="bi bi-tag"></i> Promo</button>
        </td>
      </tr>`;
    });
    document.getElementById('invTotalBadge').innerText = 'Total: ' + totalPcs + ' Pcs';
  // --- KODE BARU: HITUNG ARTIKEL UNIK DARI SUMBER DATA MENTAH ---
  const articleBadge = document.getElementById('invArticleBadge');
  if(articleBadge) {
      const uniqueArticles = new Set();
      // Kita hitung langsung dari array data Google Sheets, bukan dari tabel HTML
      data.forEach(d => {
          const code = d['Article Code'] || d['Article Name'];
          if (code) {
              uniqueArticles.add(String(code).trim());
          }
      });
      articleBadge.innerText = uniqueArticles.size + ' Artikel';
  }
  }
  function downloadTemplate() { 
    const ws_data = [['Barcode', 'Article Code', 'Article Name', 'Size', 'Price', 'Stock', 'Harga Promo']]; 
    const ws = XLSX.utils.aoa_to_sheet(ws_data); 
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Inventory_Template"); 
    XLSX.writeFile(wb, "Template_Inventory_Screamous.xlsx"); 
  }
  function processExcel() { const fileInput = document.getElementById('excelFile'); if (!fileInput.files.length) return Swal.fire('Oops!', 'Pilih file Excel!', 'warning'); const reader = new FileReader(); reader.onload = function(e) { const workbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'}); const excelRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); if (excelRows.length === 0) return Swal.fire('Kosong!', 'File Excel kosong!', 'error'); if(!("Barcode" in excelRows[0])) return Swal.fire('Format Salah!', 'Template tidak valid.', 'error'); const btn = document.getElementById('btnUploadExcel'); btn.innerHTML = 'Loading...'; btn.disabled = true; google.script.run.withSuccessHandler(res => { Swal.fire('Berhasil!', res, 'success'); btn.innerHTML = '2. Upload & Import'; btn.disabled = false; fileInput.value = ''; google.script.run.withSuccessHandler(data => { inventoryData = data; loadInventoryTable(); loadFreeStuffInventory(); }).getInventory(); }).importBulkInventory(excelRows); };reader.readAsArrayBuffer(fileInput.files[0]); }

// =========================================================================
// ENGINE IMPORT REVOTA (XML PARSER KUSUS FORMAT ADO ROWSET Z:ROW)
// =========================================================================
function processRevotaXML() {
  const fileInput = document.getElementById('xmlFile');
  if (!fileInput.files.length) return Swal.fire('Oops!', 'Pilih file XML Surat Jalan Revota terlebih dahulu!', 'warning');

  const btn = document.getElementById('btnUploadXML');
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Membaca...';
  btn.disabled = true;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

      // TEMBAK LANGSUNG KE TAG Z:ROW (Format khas Revota)
      let rows = xmlDoc.getElementsByTagName("z:row");
      
      // Fallback jika browser mengabaikan namespace 'z:'
      if (rows.length === 0) {
        rows = xmlDoc.getElementsByTagName("row"); 
      }

      if (rows.length === 0) throw new Error("Format XML tidak dikenali. Tag <z:row> tidak ditemukan.");

      const aggregatedData = {};
      let totalPcs = 0;

      // Sisir semua baris <z:row> dan sedot atributnya
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];

        // Ekstraksi data langsung dari atribut baris
        let rawBarcode = row.getAttribute('barcode') || "";
        let artCode = row.getAttribute('articleCode') || "";
        let artName = row.getAttribute('articleName') || "";
        let size = row.getAttribute('sizes') || "";
        let price = row.getAttribute('salePrice') || "0"; // Kita ambil salePrice untuk POS
        let qty = row.getAttribute('qty') || "0";
        let color = row.getAttribute('colourName') || ""; // Bonus: kita tarik juga warnanya!

        // Lewati jika data ini tidak punya barcode atau kode artikel yang valid
        if (!rawBarcode && !artCode) continue;
        if (!rawBarcode) rawBarcode = artCode; // Fallback darurat

        // --- ATURAN 1: TRANSLASI SIZE ---
        if (size.toUpperCase() === "NON" || size === "-") {
          size = "ALL SIZE";
        }

        let cleanPrice = Number(price.replace(/[^0-9]/g, '')) || 0;
        let cleanQty = Number(qty.replace(/[^0-9]/g, '')) || 0;

        // --- ATURAN 2: AKUMULASI DUPLIKAT ---
        if (aggregatedData[rawBarcode]) {
          aggregatedData[rawBarcode].Stock += cleanQty;
        } else {
          aggregatedData[rawBarcode] = {
            'Barcode': rawBarcode,
            'Article Code': artCode,
            'Article Name': artName,
            'Size': size,
            'Price': cleanPrice,
            'Stock': cleanQty,
            'Category': 'Import Revota', 
            'Color': color // Warna dimasukkan ke kolom Color
          };
        }
      }

      const finalArray = Object.values(aggregatedData);
      finalArray.forEach(item => totalPcs += item.Stock);

      if (finalArray.length === 0) throw new Error("Gagal mengekstrak atribut barang. Format <z:row> kosong.");

      // --- ATURAN 3: TAMPILKAN PREVIEW ---
      Swal.fire({
        title: 'File Revota Terbaca!',
        html: `Ditemukan <b>${finalArray.length} Artikel Unik</b><br>Total Muatan: <b>${totalPcs} Pcs</b><br><br>Apakah Anda ingin menyinkronkan data ini ke Database?`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#F7A600',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, Sinkronkan!'
      }).then((result) => {
        if (result.isConfirmed) {
          btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyinkronkan...';
          
          google.script.run
            .withFailureHandler(err => {
              Swal.fire('Gagal di Server', err.message, 'error');
              resetBtnXML();
            })
            .withSuccessHandler(res => {
              Swal.fire('Berhasil!', 'Data Revota berhasil disinkronkan!\n\n' + res, 'success');
              resetBtnXML();
              fileInput.value = ''; // Kosongkan form
              
              google.script.run.withSuccessHandler(data => {
                inventoryData = data;
                if(typeof loadInventoryTable === 'function') loadInventoryTable();
                if(typeof loadFreeStuffInventory === 'function') loadFreeStuffInventory();
              }).getInventory();
            })
            .importBulkInventory(finalArray); 
        } else {
          resetBtnXML();
          fileInput.value = '';
        }
      });

    } catch (error) {
      Swal.fire('Error Baca File!', error.message, 'error');
      resetBtnXML();
    }
  };

  reader.readAsText(fileInput.files[0]); 
}

function resetBtnXML() {
  const btn = document.getElementById('btnUploadXML');
  if(btn) {
    btn.innerHTML = 'Proses Data Revota';
    btn.disabled = false;
  }
}

  // --- FUNGSI RE-PRINT STRUK KASIR (NOTE TIDAK DICETAK KE STRUK KONSUMEN) ---
  window.reprintReceipt = function() {
    const trxId = document.getElementById('dtTrxId').innerText;
    if (!trxId) return;

    const method = document.getElementById('dtMethod').innerText;
    const subtotal = document.getElementById('dtSubtotal').innerText;
    const discount = document.getElementById('dtDiscount').innerText;
    const grandTotal = document.getElementById('dtGrandTotal').innerText;

    const rows = document.querySelectorAll('#dtTableBody tr');
    let printCartHtml = '';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if(cells.length >= 6) {
        printCartHtml += `<tr><td>${cells[1].innerText} (${cells[2].innerText})<br>@${cells[4].innerText} x ${cells[3].innerText}</td><td style="text-align:right;">${cells[5].innerText}</td></tr>`;
      }
    });

    document.getElementById('printDate').innerText = new Date().toLocaleString('id-ID') + " (COPY)";
    document.getElementById('printCart').innerHTML = printCartHtml;
    document.getElementById('printSub').innerText = subtotal;
    document.getElementById('printDisc').innerText = discount;
    document.getElementById('printTotal').innerText = grandTotal;
    
    // Note ditiadakan dari cetak struk agar privasi catatan rahasia kasir aman
    // Note ditiadakan dari cetak struk agar privasi catatan rahasia kasir aman
    document.getElementById('printMethod').innerHTML = method;

    try { JsBarcode("#printBarcode", trxId, {width: 1.5, height: 40, displayValue: true, fontSize: 12, margin: 0}); } catch(e) {}

    document.body.classList.add('printing-receipt'); 
    window.print(); 
    setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);
  };
  // --- KONTROLLER MODAL & SAKLAR PREFILLED DISCOUNT ---
   window.openPromoModal = function(barcode, name, currentPromo) {
     const modal = new bootstrap.Modal(document.getElementById('promoModal'));
     modal.show();
     document.getElementById('pmBarcode').value = barcode;
     document.getElementById('pmName').value = name;
     document.getElementById('pmPromoPrice').value = currentPromo ? Number(currentPromo) : '';
   };

   window.submitPromoPrice = function() {
     try {
       const barcode = document.getElementById('pmBarcode').value;
       const promoPrice = document.getElementById('pmPromoPrice').value;
       const btn = document.getElementById('btnSubmitPromo'); 
       
       // Ubah tampilan tombol biar kelihatan sedang proses
       if (btn) {
           btn.innerHTML = 'Menyimpan...';
           btn.disabled = true;
       }
       
       google.script.run
         .withFailureHandler(err => {
           Swal.fire('Gagal di Server', err.message, 'error');
           if (btn) { btn.innerHTML = 'Simpan Harga Promo'; btn.disabled = false; }
         })
         .withSuccessHandler(res => {
           Swal.fire('Berhasil!', res, 'success');
           if (btn) { btn.innerHTML = 'Simpan Harga Promo'; btn.disabled = false; }
           
           // Refresh inventory global agar harga promo ter-update
           google.script.run.withSuccessHandler(data => {
             inventoryData = data;
             if (typeof renderInv === 'function') renderInv(inventoryData);
           }).getInventory();
           
           // Tutup modal
           const modalEl = document.getElementById('promoModal');
           const modalInstance = bootstrap.Modal.getInstance(modalEl);
           if(modalInstance) modalInstance.hide();
           
         }).updatePromoPrice(barcode, promoPrice);
         
     } catch(e) {
       // Kalau ada kode yang salah ketik, error-nya akan muncul di layar!
       Swal.fire('Error Lokal', 'Ada masalah: ' + e.message, 'error');
     }
   };

   window.handlePromoToggle = function(isActive) {
     google.script.run.withSuccessHandler(res => {
       Swal.fire('Status Diperbarui', `Fitur Harga Promo Event berhasil di-${res ? 'AKTIFKAN (ON)' : 'NONAKTIFKAN (OFF)'}`, 'success');
     }).togglePromoMode(isActive);
   };

// --- ENGINE NAVIGASI DENGAN INDIKATOR AKTIF ---
function showPage(pageId) { 
  if(pageId === 'closingPage') return; 
  
  // 1. Sembunyikan semua kontainer halaman
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active')); 
  
  // 2. Matikan semua garis bawah dan warna kuning di menu atas
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active')); 
  
  // 3. Munculkan halaman yang dituju
  const targetPage = document.getElementById(pageId);
  if(targetPage) targetPage.classList.add('active'); 
  
  // 4. Nyalakan kembali indikator garis bawah kuning pada tombol yang diklik
  const activeMenu = Array.from(document.querySelectorAll('.nav-link')).find(el => {
    const clickAttr = el.getAttribute('onclick') || '';
    return clickAttr.includes(pageId);
  });
  if(activeMenu) activeMenu.classList.add('active');
}

// SENSOR OTOMATIS MATI/NYALA INTERNET
window.addEventListener('online', () => { if (typeof checkOfflineBadge === 'function') checkOfflineBadge(); });
window.addEventListener('offline', () => { if (typeof checkOfflineBadge === 'function') checkOfflineBadge(); });

// =========================================================================
// MENDAFTARKAN SERVICE WORKER (SATPAM OFFLINE PWA)
// =========================================================================
// MENDAFTARKAN SERVICE WORKER (SATPAM OFFLINE PWA)
// =========================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Satpam PWA Aktif! Ruang lingkup:', reg.scope))
      .catch(err => console.error('PWA Gagal didaftarkan:', err));
  });
}
