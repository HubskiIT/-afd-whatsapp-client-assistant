# Przewodnik wdrożenia krok po kroku

Szacowany czas: **60–90 minut**, z czego większość to klikanie po panelu Meta i zgodach OAuth Google. Zakładam, że masz już działającą instancję n8n dostępną po HTTPS (webhooki Mety wymagają HTTPS z ważnym certyfikatem).

## Czego potrzebujesz przed startem

- [ ] Konto w [Meta for Developers](https://developers.facebook.com) (zwykłe konto Facebook wystarczy)
- [ ] Instancja n8n z publicznym adresem HTTPS
- [ ] Klucz API OpenAI
- [ ] Konto Google (Sheets + Calendar + Gmail na tym samym koncie jest najprościej)
- [ ] Telefon z WhatsAppem do testów

## Krok 1: Aplikacja Meta i testowy numer WhatsApp (~20 min)

1. Wejdź na [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → typ **Business**.
2. W panelu aplikacji znajdź produkt **WhatsApp** i kliknij **Set up**. Meta utworzy testowy numer telefonu — darmowy, ważny 90 dni.
3. W zakładce **WhatsApp → API Setup** zanotuj:
   - **Temporary access token** → `WHATSAPP_TOKEN` (uwaga: wygasa po 24h; na dłużej wygeneruj token systemowego użytkownika w Business Settings)
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
4. W sekcji **To** dodaj numery telefonów, na które bot będzie mógł pisać (limit: 5). Każdy numer musi potwierdzić kodem.
5. **App Settings → Basic → App Secret** → `WHATSAPP_APP_SECRET`.
6. Wymyśl dowolny ciąg znaków jako `WHATSAPP_VERIFY_TOKEN` (np. wygenerowany hasłomat) — wpiszesz go w dwóch miejscach: w env n8n i w panelu Meta w kroku 4.

## Krok 2: Arkusze Google i kalendarz (~10 min)

1. Utwórz arkusz Google z zakładką o nazwie **FAQ** i kolumnami `question`, `answer`. Zaimportuj [mock-data/faq-example.csv](../mock-data/faq-example.csv) albo wpisz własne pytania.
2. Utwórz drugi arkusz (albo drugą zakładkę w osobnym pliku) o nazwie **Log** z nagłówkami: `timestamp`, `customer_phone`, `message`, `intent`, `handled_by`, `response`.
3. Z paska adresu obu arkuszy skopiuj ID (fragment między `/d/` a `/edit`) → `FAQ_SHEET_ID` i `LOG_SHEET_ID`.
4. Kalendarz: wystarczy główny kalendarz konta Google → `GOOGLE_CALENDAR_ID` to jego adres e-mail. Dorzuć kilka wydarzeń na najbliższe dni, żeby demo miało co omijać.

## Krok 3: n8n — zmienne środowiskowe i import workflow (~15 min)

1. Ustaw w środowisku n8n zmienne z [.env.example](../.env.example). Dla Dockera dopisz do `docker-compose.yml`:

   ```yaml
   environment:
     - WHATSAPP_VERIFY_TOKEN=...
     - WHATSAPP_APP_SECRET=...
     - WHATSAPP_PHONE_NUMBER_ID=...
     - FAQ_SHEET_ID=...
     - LOG_SHEET_ID=...
     - GOOGLE_CALENDAR_ID=...
     - ESCALATION_NOTIFY_EMAIL=...
     - NODE_FUNCTION_ALLOW_BUILTIN=crypto
   ```

   `NODE_FUNCTION_ALLOW_BUILTIN=crypto` jest niezbędne — bez tego node weryfikacji podpisu nie zaimportuje modułu `crypto` i każde żądanie zostanie odrzucone.

2. Zrestartuj n8n, żeby zmienne weszły w życie.
3. Zaimportuj [workflows/whatsapp-assistant.json](../workflows/whatsapp-assistant.json): **Workflows → Import from File**.
4. Podłącz credentiale (n8n podświetli node'y, które ich potrzebują):
   - **OpenAI** (nody „Classify Intent" i „Compose FAQ Answer") — klucz API
   - **Google Sheets OAuth2** (nody „Read FAQ Sheet" i „Log Conversation")
   - **Google Calendar OAuth2** (node „Get Calendar Busy Times")
   - **Gmail OAuth2** (node „Notify Reception")
   - **WhatsApp API** (node „Send WhatsApp Reply") — token i Business Account ID z panelu Meta
5. Aktywuj workflow przełącznikiem w prawym górnym rogu.

## Krok 4: Rejestracja webhooka w panelu Meta (~10 min)

1. W panelu Meta: **WhatsApp → Configuration → Webhook** → **Edit**.
2. **Callback URL**: `https://<twoj-n8n>/webhook/whatsapp`
3. **Verify token**: dokładnie ta sama wartość co `WHATSAPP_VERIFY_TOKEN` w env n8n.
4. Kliknij **Verify and save** — Meta wyśle żądanie GET z `hub.challenge`, workflow odpowie na nie automatycznie. Jeśli weryfikacja nie przechodzi, sprawdź, czy workflow jest **aktywny** (webhooki produkcyjne działają tylko w aktywnym workflow).
5. W sekcji **Webhook fields** zasubskrybuj pole **messages**.

## Krok 5: Test end-to-end (~10 min)

- [ ] Z telefonu dodanego do odbiorców testowych wyślij na numer testowy: *„Ile kosztuje manicure hybrydowy?"* → powinna wrócić odpowiedź z ceną z arkusza FAQ.
- [ ] Wyślij: *„Chciałabym umówić się na wizytę"* → powinny wrócić trzy terminy omijające wydarzenia z kalendarza.
- [ ] Wyślij: *„Mam reklamację, zabieg mi zaszkodził!"* → klient dostaje informację o przekazaniu sprawy, a na `ESCALATION_NOTIFY_EMAIL` przychodzi mail z treścią.
- [ ] Sprawdź arkusz **Log** — po trzech wiadomościach powinny być trzy wiersze z poprawnymi intencjami.

## Najczęstsze problemy

| Objaw | Przyczyna |
|---|---|
| Meta nie weryfikuje webhooka | Workflow nieaktywny albo różne wartości verify token w n8n i panelu Meta |
| Każde żądanie kończy się błędem podpisu | Brak `NODE_FUNCTION_ALLOW_BUILTIN=crypto` albo zły `WHATSAPP_APP_SECRET` |
| Bot milczy, execution przechodzi | Wiadomość przyszła z numeru spoza listy 5 odbiorców testowych |
| Błąd 401 przy wysyłce odpowiedzi | Token tymczasowy wygasł (24h) — wygeneruj stały token systemowego użytkownika |
| Puste terminy mimo wolnego kalendarza | Zły `GOOGLE_CALENDAR_ID` albo brak zgody OAuth na odczyt kalendarza |
