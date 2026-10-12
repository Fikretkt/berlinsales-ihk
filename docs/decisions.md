# Mimari kararlar

- D1: `company` tablosu korunur. Tenant izolasyonu bu sprintte yalnızca `customer` ve admin domainiyle sınırlıdır; `market` domainine `company_id` ekleyen migration Sprint 3 backlog'una bırakılmıştır.
- D2: Görüşme sonuçları `sale`, `consideration`, `rejected`, `no_contact` değerleridir.
- D3: Görüşme türleri `in_person`, `phone`, `whatsapp`, `email` değerleridir.
- D4: Satış MVP'de eklenebilir; silme yalnızca admin tarafından yapılır.
- D5: MarktSync miras pattern'leri korunur: `citext`, token akışı, audit CHECK deseni, `pg_trgm` ve UTC `TIMESTAMPTZ`.
- D6: Status state-machine, advisory lock, cooldown, reservation ve SSE müşteri domaininin kapsamı dışındadır.

## Sprint 1 kararları

- Customer sorguları daima oturum kullanıcısının `company_id` değeriyle sınırlandırılır.
- Field user yalnızca kendisine atanmış müşterileri görür; atama ve blacklist değişiklikleri yalnızca admin yetkisindedir.
- UI oturumu Sprint 2'ye bırakılmıştır. Geliştirme ortamında API testleri için `x-dev-user-email` header'ı kullanılır; production ortamında mevcut Auth.js oturumu kullanılır.
- Kullanımda olmayan `react-leaflet`, `@react-email/components`, `@sentry/nextjs` ve `wrangler` kaldırılmıştır. `leaflet`, `idb`, `xlsx` ve `node-cron` aktif kullanım nedeniyle korunur.

## Sprint 2 çalışma ve CI kararları

- Sprint branch'i değişiklik yapılmadan önce `git checkout main`, `git pull` ve `git checkout -b sprint/02-auth` sırasıyla açılır. Commit'ler yalnızca sprint branch'ine yazılır; `main` yalnızca Merge Request ile güncellenir. MR başlığında merge'i engelleyen `Draft:` öneki kullanılmaz.
- Her MR pipeline'ı GitLab UI üzerinden doğrulanır; yeşil CI olmadan merge yapılmaz. Sprint 1'de pipeline'ın hiç koşmadığının fark edilmemesi bu zorunluluğun gerekçesidir.
- `main` güncellenirken önce `git checkout main` çalıştırılır. Sprint branch'i üzerinde hiçbir zaman `git pull origin main` çalıştırılmaz.
