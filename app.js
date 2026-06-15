
  let inventoryData = []; let cart = []; let freeCart = []; 
  let recapData = []; let freeLogData = [];
  let currentSettings = { shopName: 'SCREAMOUS', eventName: 'Event Pop-up Store', footer: 'Thank you for shopping with us!', keyCash: 'F8', keyQris: 'F9', keyCard: 'F10', keyTransfer: 'F11' };
  
  let selectedPaymentMethod = ''; 
  let activeKeyBindTarget = null; 

  function startLiveClock() { setInterval(() => { const now = new Date(); const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']; const dayName = days[now.getDay()]; const dateString = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); const timeString = now.toLocaleTimeString('id-ID', { hour12: false }); document.getElementById('liveClock').innerText = `${dayName}, ${dateString} | ${timeString}`; }, 1000); }

  // INI DIA KUNCI KONTAK YANG HILANG KEMARIN (FUNGSI INIT OTOMATIS)
  window.onload = () => {
    startLiveClock(); 
    const fpConfig = { dateFormat: "Y-m-d", disableMobile: "true" };
    flatpickr("#recapStartDate", fpConfig); flatpickr("#recapEndDate", fpConfig); flatpickr("#rfStartDate", fpConfig); flatpickr("#rfEndDate", fpConfig); flatpickr("#closingDateInput", fpConfig);
    
    google.script.run.withSuccessHandler(settings => { currentSettings = settings; applyReceiptSettings(); loadSettingsForm(); calculateTotal(); }).getSettings();
    google.script.run.withSuccessHandler(data => { inventoryData = data; renderPosList(inventoryData); loadFreeStuffInventory(); loadInventoryTable(); }).getInventory();
    
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
    
    document.body.classList.add('printing-receipt'); window.print(); setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);

    if (navigator.onLine) {
      google.script.run
        .withFailureHandler(err => { saveToLocalStorage(payload); })
        .withSuccessHandler(res => { clearCart(); google.script.run.withSuccessHandler(data => { inventoryData = data; renderPosList(inventoryData); loadFreeStuffInventory(); loadInventoryTable(); }).getInventory(); })
        .processTransaction(payload);
    } else {
      saveToLocalStorage(payload);
    }
  }

  function saveToLocalStorage(payload) {
    let offlineData = JSON.parse(localStorage.getItem('screamous_offline_trx')) || [];
    offlineData.push(payload);
    localStorage.setItem('screamous_offline_trx', JSON.stringify(offlineData));
    clearCart();
    Swal.fire('Mode Darurat Offline', 'Data diamankan di memori laptop. Tekan tombol Sync di atas jika internet kembali normal.', 'warning');
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
      google.script.run.withSuccessHandler(data => { inventoryData = data; renderPosList(inventoryData); loadInventoryTable(); }).getInventory();
    }).catch(err => { Swal.fire('Sync Gagal', 'Koneksi Sheets terputus tengah jalan, silakan coba lagi!', 'error'); });
  }
