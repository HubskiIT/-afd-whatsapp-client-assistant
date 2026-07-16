# Scenariusz demo — rozmowa z właścicielem agencji

To nie jest dokumentacja techniczna. To plan 10-minutowej rozmowy, w której pokazujesz działającego bota komuś, kto sprzedaje kampanie lokalnym biznesom i traci klientów przez wolne odpowiedzi.

## Otwarcie (1 min)

> „Puszczasz klientowi kampanię, leady sypią się na WhatsAppa — i co się z nimi dzieje przez pierwsze dwie godziny? Nic. Recepcja robi paznokcie, telefon leży w szufladzie. Część z tych osób w tym czasie umawia się gdzie indziej. Płacicie za zapytania, które nikt nie odbiera. Pokażę ci, jak to wygląda, kiedy odpowiedź przychodzi w kilka sekund."

Nie tłumacz architektury. Właściciela agencji nie obchodzi n8n — obchodzi go klient, który przestanie narzekać.

## Scena 1: pytanie o cennik (2 min)

Wyślij z telefonu na numer demo: **„Ile kosztuje manicure hybrydowy?"**

Odpowiedź przychodzi w kilka sekund, z konkretną ceną i czasem trwania. Podkreśl dwie rzeczy:

- Cennik siedzi w zwykłym arkuszu Google. Recepcjonistka zmienia cenę w arkuszu — bot od razu odpowiada nową. Nikt nie dzwoni do programisty.
- Bot odpowiada **tylko** na podstawie tego arkusza. Zapytaj przy kliencie o coś, czego w arkuszu nie ma (np. „Czy robicie przedłużanie rzęs?") — bot nie zmyśli usługi, tylko przekaże sprawę człowiekowi. To jest moment, w którym budujesz zaufanie.

## Scena 2: umówienie wizyty (2 min)

Wyślij: **„Chciałabym umówić się na jutro"**

Bot proponuje trzy najbliższe wolne terminy — prawdziwe, z kalendarza Google, omijające istniejące rezerwacje i godziny zamknięcia. Pokaż kalendarz obok: dodaj wydarzenie, wyślij pytanie jeszcze raz, termin znika z propozycji.

## Scena 3: reklamacja (3 min)

Wyślij: **„Jestem bardzo niezadowolona z wczorajszego zabiegu, chcę zwrot pieniędzy!"**

Dwie rzeczy dzieją się jednocześnie:

1. Klientka dostaje spokojną odpowiedź, że sprawą zajmie się człowiek — bez wymądrzania się bota w drażliwej sprawie.
2. Na skrzynkę recepcji przychodzi mail z pełną treścią i numerem telefonu.

To jest odpowiedź na pytanie, które padnie na każdej rozmowie: *„A co jak bot powie głupotę?"* — Bot ma zasadę: jeśli nie jest pewien, nie odpowiada. Reklamacje, sprawy pilne, dziwne pytania — wszystko idzie do człowieka. Bot obsługuje nudną większość, człowiek dostaje trudną mniejszość.

## Liczby na koniec (2 min)

Otwórz arkusz z logiem rozmów i pokaż kolumnę `handled_by`:

> „Każda rozmowa jest tutaj. Po miesiącu wiecie dokładnie: tyle zapytań weszło, tyle bot obsłużył sam, tyle poszło do recepcji. To są liczby do raportu dla waszego klienta — czas odpowiedzi spadł z godzin do sekund, a recepcja dotyka tylko spraw, które naprawdę wymagają człowieka."

## Możliwe pytania i odpowiedzi

**„Ile to kosztuje w utrzymaniu?"** — Przy skali lokalnego salonu koszty API OpenAI to grosze miesięcznie; główny koszt to hosting n8n (od ~20 zł/mies za VPS).

**„Czy to działa na Messengerze / Instagramie?"** — Ta sama logika, inny kanał wejścia. Messenger wymaga dodania testerów albo przeglądu aplikacji przez Metę — to rozszerzenie, nie przeszkoda.

**„Co trzeba, żeby wdrożyć u prawdziwego klienta?"** — Weryfikacja biznesowa w Mecie (dokumenty firmy, 2–10 dni roboczych) i podpięcie prawdziwego numeru zamiast testowego. Reszta zostaje bez zmian.

**„Czy bot umawia wizyty sam?"** — Celowo nie. Proponuje terminy, potwierdza recepcja. Automatyczny zapis do kalendarza to następny etap — najpierw zaufajcie botowi w odpowiadaniu.
