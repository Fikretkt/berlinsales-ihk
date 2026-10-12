# Sprint 2 sistem denetimi

Denetim tarihi: 2026-09-03. Branch: `sprint/02-auth`, taban `c9a9453`, CI düzeltmesi `4614fa0`.

## Test kapsamı boşlukları

- 🔴 `auth.ts:29-61`, `app/api/v1/auth/login/route.ts:16` — Credentials login için başarı, yanlış parola, pasif kullanıcı, audit ve `last_login_at` davranışlarını doğrulayan route/integration testi yok. Öneri: saat ve DB mock'lu unit testlere ek olarak gerçek PostgreSQL üzerinde başarı/başarısızlık audit testi ekleyin.
- 🔴 `lib/auth/session.ts:15-33` — `x-dev-user-email` production guard'ının header'ı kesin reddettiğini kanıtlayan test yok. Öneri: `NODE_ENV=production` ve sahte header ile `auth()` fallback sonucunu doğrulayan izole test ekleyin.
- 🔴 `middleware.ts:3-8`, `auth.config.ts:26-48` — anonim kullanıcının korumalı UI ve API rotalarından login'e yönlendirildiğini kapsayan regresyon testi yok. Ayrıca matcher `/api/v1/events` rotasını tamamen hariç tutuyor. Öneri: matcher tablosu üzerinden public/protected rota parametrik testleri ve HTTP smoke testi ekleyin.
- 🟡 `app/api/customers/route.ts`, `app/api/customers/[id]/route.ts`, `test/integration/customers.test.ts` — entegrasyon testi repository/API katmanını çağırmıyor; doğrudan Drizzle sorgularıyla beklenen filtreyi yeniden kuruyor. Öneri: route handler veya repository üzerinden create/list/get/patch ve cross-tenant UUID denemeleri ekleyin.
- 🟡 `lib/customers/rules.test.ts` — izin kuralları testli, fakat field user'ın başka kullanıcıya atanmış ve atanmamış kayıtları görememesi DB mock'uyla doğrulanmıyor. Öneri: üretilen `WHERE company_id AND assigned_to` koşulunu repository testiyle doğrulayın.
- 🟡 `app/api/v1/auth/reset-request/route.ts`, `reset-confirm/route.ts`, `setup/route.ts` — anti-enumeration, token süresi, tek kullanım, yarışan iki consume, mail hatası ve audit senaryoları route seviyesinde testsiz. Öneri: kontrollü saat ve mailer fake'iyle unit/integration testleri ekleyin.
- 🟡 `lib/users/admin.ts` ve `app/api/v1/admin/users/**` — davet, activate/deactivate, rol değişimi ve tenant sınırı için test yok. Öneri: iki şirketli integration fixture ile liste/get/update/invite cross-tenant denemeleri ekleyin.
- 🟢 `test/integration/trigger.test.ts:664` — concurrency testi kritik korumayı kapsıyor, ancak eski sürüm kazanan connection sırasını 50 ms sleep ile varsayıyordu. Sprint 2 A kapsamında sonuç kümesi sıra bağımsız hale getirildi.

## Güvenlik gözden geçirmesi

- 🔴 `lib/users/admin.ts:26-57,71-96,136-165` — `listUsers()` tüm şirketleri listeliyor; `inviteUser()` request'ten gelen `companyId` değerini kabul ediyor; `updateUser()` ID ile tüm tenant'lardaki kullanıcıları değiştirebiliyor. `requireAdmin` sadece rolü doğruluyor. Öneri: tüm sorgulara `admin.companyId` filtresi ekleyin, company değişikliğini kaldırın veya açık super-admin modeli tanımlayın.
- 🔴 `app/api/v1/admin/companies/route.ts:5-9` ve `lib/users/admin.ts:59-64` — normal tenant admin bütün şirketleri görebiliyor. Öneri: yalnızca kendi şirketini döndürün veya ayrı platform-admin rolü tasarlayın.
- 🔴 `scripts/reset-dev-user.ts:10` — development admin parolası source içinde açık yazılı. Guard production çalıştırmasını önlese de credential repo geçmişine girer. Öneri: parolayı zorunlu `DEV_ADMIN_PASSWORD` env değişkeninden alın ve guard'ı test edin.
- 🟡 `lib/auth/session.ts:16-31` — header fallback yalnızca `NODE_ENV !== "production"` koşulunda çalışıyor; production doğrudan sızma yolu görülmedi. Risk, staging'in yanlışlıkla development `NODE_ENV` ile başlatılmasıdır. Öneri: ayrıca açık `ALLOW_DEV_IMPERSONATION=true` şartı, localhost kontrolü ve production guard testi ekleyin.
- 🔴 `lib/markets/**`, `app/api/v1/markets/**` — market şemasında `company_id` bulunmuyor; birçok detail/mutation sorgusu yalnızca `id` ile çalışıyor. D1'deki multi-tenant iddiası Customer dışında sistem geneline uygulanmış değil. Öneri: tenant modelini market ve bağlı tablolara migration ile taşıyıp her sorguyu scope edin.
- 🟡 `lib/notes/repo.ts:35,103` — bazı okuma/güncelleme sorguları yalnızca market/note ID kullanıyor; tenant sınırı üst katmandaki erişim kontrolüne bağlı. Öneri: repository seviyesinde company scope zorunlu olsun.
- 🟡 `lib/reports/queries.ts:198`, `lib/jobs/broadcast-cooldown-expiry.ts:24` — `sql.raw()` sayısal değer üretiminde kullanılıyor. Çağıran doğrulama şu an sayıya zorlasa da raw SQL gereksiz risk yaratıyor. Öneri: interval hesabını parametreli ifade veya `make_interval` ile kurun.
- 🟢 Diğer incelenen raw sorgular Drizzle template parametreleri veya `$1` parametreleri kullanıyor; doğrudan kullanıcı girdisi birleştiren açık SQL injection bulunmadı.
- 🟡 `scripts/create-test-admin.ts`, `scripts/create-demo-users.ts` — geliştirme parolaları source ve console çıktısında bulunuyor, ayrıca production guard'ları yok. Öneri: env tabanlı credential ve ortak, testli non-production guard kullanın.

## Migration sağlığı

- 🔴 `lib/db/migrations/0002_action_undone_event.sql`, `002_customers.sql`, `003_customer_audit_events.sql` — iki farklı numaralandırma genişliği kullanılıyor. Leksikografik sıra bugün `0002` → `002` → `003` olsa da yeni `0003_*` migration'ı `002`den önce çalışır ve paralel branch çakışmasına açıktır. Öneri: bundan sonraki migration'larda tek dört haneli monoton sıra belirleyin ve mevcut dosyaları değiştirmeden yeni bir migration registry politikası yazın.
- 🟡 `002_customers.sql` — `CREATE TABLE/INDEX/TRIGGER` ifadeleri SQL düzeyinde idempotent değil; güvenlik yalnızca `__migrations` kaydına dayanıyor. Kısmi/manual schema durumunda tekrar çalışma başarısız olur. Öneri: runner transaction garantisini test edin; yeni migration'larda koşullu DDL kullanın.
- 🟡 `003_customer_audit_events.sql` — constraint'i sabit adla koşulsuz düşürüyor. Farklı baseline veya daha önce değiştirilmiş constraint'te migration durur. Öneri: `DROP CONSTRAINT IF EXISTS` ve katalog kontrollü migration kalıbı kullanın.
- 🔴 `scripts/migrate.ts` ve yerel DB geçmişi — daha önce `0000_initial.sql`, uyumsuz mevcut `audit_log` nedeniyle `user_id` FK eklerken başarısız oldu. Repo migration geçmişi ile mevcut `itmart_dev` fiziksel şeması eşleşmiyor. Öneri: veri korunacaksa ayrı reconciliation migration; disposable ise belgeli DB recreate prosedürü uygulayın.

## Ölü kod ve isim tutarsızlıkları

- 🔴 `package.json:8`, `eslint.config.mjs` — `pnpm lint` hâlâ deprecated `next lint` kullanıyor ve yerel doğrulamada tamamlanmadı. Doğrudan `eslint .` ise silinmiş monorepo denemesinden kalan `apps/web/.next` artefaktlarını tarayıp 416 problem (41 error, 375 warning) üretiyor. Öneri: ESLint CLI migration'ını tamamlayın, tüm `**/.next/**` yollarını ignore edin ve yalnızca source/config kapsamını lintleyin.
- 🟡 `app/api/v1/events/stream/route.ts:18`, `lib/actions/insert.ts:8-10`, `lib/reservations/insert.ts:9`, `lib/sse/listen-client.ts:108` — görevde belirtilen unused import/parametre ve gereksiz disable warning'leri halen mevcut. Öneri: tooling cleanup sırasında tek tek kaldırın.
- 🟡 `auth.config.ts:17` — cookie adı hâlâ `marktsync_session`; `lib/db/client.ts:7` global pool adı `__marktsyncPool`; test DB ve yorumlarda çok sayıda MarktSync adı var. Öneri: cookie geçiş etkisini değerlendirerek kontrollü ITMART rename listesi çıkarın.
- 🟡 `.claude/skills/marktsync-*`, dokümanlar ve test fixture'ları — eski ürün adı yaygın. Öneri: domain anlamı taşıyan referanslarla tarihsel dokümanları ayırıp aktif config/kod isimlerini güncelleyin.
- 🟡 `postgres` ve `pg` birlikte dependency olarak bulunuyor; kod taramasında uygulama `pg` kullanıyor. Öneri: `postgres` paketinin gerçek kullanımını lockfile hariç doğrulayıp kaldırın.
- 🟢 `leaflet`, `leaflet.markercluster`, `idb`, `xlsx` ve `node-cron` aktif kod tarafından kullanılıyor; bunlar ölü dependency değil.

## Dokümantasyon sapmaları

- 🔴 `docs/decisions.md` D1 — sistemin multi-tenant hazır olduğunu söylüyor, fakat market ve admin-user sorguları tenant-scoped değil.
- 🟡 `docs/decisions.md` Sprint 1 — “UI oturumu Sprint 2'ye bırakıldı” ifadesi yanıltıcı; Auth.js login/reset/setup UI ve altyapısı zaten mevcut, eksik olan production hardening.
- 🔴 `docs/setup.md:4` — açık dev parola dokümante edilmiş ve aynı parola source içinde sabit. Env tabanlı oluşturma akışı anlatılmalı.
- 🟡 `docs/setup.md:3` — `pnpm test` zaten package script gereği unit ve integration testlerini birlikte çalıştırıyor; metin bunu yalnızca unit test gibi tanımlıyor.
- 🟡 `docs/setup.md` — yerel DB'nin migration geçmişiyle çakışması, recreate/reconciliation adımları ve CI gereksinimleri anlatılmıyor.

## Konfigürasyon tutarlılığı

- 🔴 `.env.example` — staging talebinde adı geçen `NEXTAUTH_SECRET` yok; kod Auth.js v5 standardı olarak `AUTH_SECRET` kullanıyor. CI ve staging dokümanı tek isimde uzlaştırılmalı.
- 🟡 `.env.example` — `SENTRY_DSN` ve `SENTRY_AUTH_TOKEN` var fakat Sentry dependency/entegrasyonu kaldırılmış. Fazla ve yanıltıcı değişkenler.
- 🟡 `.env.example` — `AUTH_TRUST_HOST` eksik; CI/staging kapsamı bunu zorunlu kabul ediyor.
- 🟡 `scripts/reset-dev-user.ts` için önerilen `DEV_ADMIN_PASSWORD` henüz tanımlı değil; mevcut script hardcoded parola kullanıyor.
- 🟢 `DATABASE_URL`, `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ENABLE_CRON` kod kullanımlarıyla eşleşiyor.

## Öncelik özeti

Sprint 2 uygulamasına geçmeden önce tenant-scoped admin user yönetimi, hardcoded dev credential, local migration reconciliation ve production impersonation guard testi çözülmelidir. Auth rate limiting/audit/session timeout ile staging pipeline henüz uygulanmış değildir; bunlar mevcut davranış değil, Sprint 2 planlanan işidir.

## Backlog — bilinçli ertelenenler

- **Sprint 3:** `market` ve bağlı domain tablolarına `company_id` eklenmesi ve tüm market sorgularının tenant-scoped hale getirilmesi.
- **Sonraki bakım sprinti:** `marktsync_session` cookie ve `__marktsyncPool` global adlarının kontrollü ITMART rename'i.
- **Sonraki güvenlik bakımı:** `lib/reports/queries.ts` ve job sorgularındaki `sql.raw` interval ifadelerinin parametreli SQL'e dönüştürülmesi.
- **Sonraki bağımlılık bakımı:** Kullanılmadığı doğrulanan `postgres` paketinin kaldırılması. Bu aşamada lockfile/dependency temizliği yapılmayacaktır.
