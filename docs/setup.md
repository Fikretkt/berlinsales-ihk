# Kurulum (Windows / PowerShell)

1. PostgreSQL 18 container'ını başlatın:

```powershell
docker start itmart-db
```

İlk kurulumda container oluşturmak için:

```powershell
docker run --name itmart-db -e POSTGRES_PASSWORD=itmart_dev_pw -e POSTGRES_DB=itmart_dev -p 5433:5432 -v itmart_pgdata:/var/lib/postgresql -d postgres:18
```

2. `.env.example` dosyasını `.env` olarak kopyalayın. Tek yerel bağlantı kaynağı budur: PostgreSQL `localhost:5433`, `itmart_dev`.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
$env:DEV_ADMIN_PASSWORD = Read-Host "Dev admin password"
pnpm db:reset-dev-user
pnpm dev
```

3. Birim testleri `pnpm test`, Testcontainers kullanan entegrasyon testleri ise Docker çalışırken `pnpm test:integration` ile başlatılır. Test container'ı dinamik bir port kullanır; `5433`e bağlı değildir.

4. Dev admin e-postası `admin@itmart.local` değeridir; parola yalnızca `DEV_ADMIN_PASSWORD` environment değişkeninden alınır ve repoda saklanmaz. Login sonrası `GET /api/customers` isteği aynı oturumla JSON döndürür. API impersonation yalnızca `NODE_ENV !== 'production'` ve `ALLOW_DEV_IMPERSONATION=true` birlikte sağlandığında `x-dev-user-email: admin@itmart.local` header'ıyla kullanılabilir.

## Migration standardı

Yeni migration dosyaları dört haneli, artan ve benzersiz sıra kullanır: `0003_description.sql`, `0004_description.sql`. Açılmış bir migration'ın adı veya içeriği değiştirilmez; düzeltme yeni sıra numarasıyla eklenir. Paralel branch açmadan önce mevcut en yüksek numara kontrol edilir.

## Yerel veritabanını yeniden oluşturma

Bu prosedür yalnızca disposable yerel geliştirme verisi içindir; volume veya staging/production veritabanında uygulanmaz:

```powershell
docker rm -f itmart-db
docker volume rm itmart_pgdata
docker run --name itmart-db -e POSTGRES_PASSWORD=itmart_dev_pw -e POSTGRES_DB=itmart_dev -p 5433:5432 -v itmart_pgdata:/var/lib/postgresql -d postgres:18
pnpm db:migrate
$env:DEV_ADMIN_PASSWORD = Read-Host "Dev admin password"
pnpm db:reset-dev-user
```
