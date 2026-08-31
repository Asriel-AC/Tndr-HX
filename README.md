🚀 Tndr-HX (Tandro Erweiterung & Automatisierung)

Tndr-HX ist das ultimative Toolset für den Tandro-Chat. Es besteht aus zwei Teilen, die nahtlos zusammenarbeiten: Einem Backend (welches lokal auf deinem PC als Datenbank und Steuerzentrale fungiert) und einem Browser-Userscript, das direkt im Chat läuft.

✨ Funktionsumfang

🥷 Emoji-Dieb: Klau Emojis von anderen Spielern mit einem einzigen Klick direkt aus dem Chatverlauf.

🎭 Avatar-Vault Stealer: Speichere fremde Avatare vollautomatisch (und von EXIF-Daten bereinigt) direkt in deinen eigenen Tandro-Kleiderschrank (Vault).

💰 Marktplatz-Manager: Übersicht über alle deine aktiven Verkäufe (Tiefenscan über 30 Seiten). Angebote mit einem Klick löschen oder alle gleichzeitig wieder auf Platz 1 pushen.

🤖 Auto-Market (Backend): Lass deine Marktplatz-Angebote vollautomatisch in einem bestimmten Intervall (z.B. alle 5 Minuten) im Hintergrund pushen.

🚷 Block+ & Makros: Erweiterte Blocklisten (für User und bestimmte Wörter) und Schnell-Antworten (Makros).

🛠️ Installation (Schritt-für-Schritt)

Damit alles funktioniert, musst du beide Teile (Backend und Frontend) einrichten. Das dauert nur etwa 2 Minuten.

Schritt 1: Das Backend installieren

Das Backend speichert deine Emojis, Makros und steuert automatische Timer (wie den Auto-Market). Du hast zwei Möglichkeiten, es zu nutzen:

Methode A: Die fertige .exe (Empfohlen für Windows)

Lade dir unter "Releases" die Datei Tndr-HX_backend.exe herunter.

Lege die Datei in einen eigenen Ordner (z.B. auf dem Desktop). Dort wird das Programm später auch seine Datenbank-Datei speichern.

Hinweis: Da es sich um ein unbekanntes Programm handelt, warnt Windows SmartScreen beim ersten Start eventuell. Klicke einfach auf "Weitere Informationen" und dann auf "Trotzdem ausführen".

Du brauchst hierfür kein Python!

Methode B: Das Python-Skript (Für Entwickler, Linux & Mac)

Lade dir Python 3 herunter und installiere es (Setze bei der Installation unbedingt den Haken bei "Add Python to PATH"!).

Lade dir die Datei tndr_hx_backend.py aus diesem Projekt herunter und lege sie in einen eigenen Ordner.

Schritt 2: Das Browser-Skript installieren (Violentmonkey)

Das Skript baut das Menü in den Tandro-Chat ein und verbindet sich mit dem Backend.

Installiere dir die kostenlose Browser-Erweiterung Violentmonkey (verfügbar für Chrome/Edge und Firefox).

Klicke oben rechts in deinem Browser auf das Violentmonkey-Symbol und wähle "Neues Skript erstellen" (das kleine Plus-Symbol +).

Lösche den Text, der dort bereits steht, komplett heraus.

Kopiere den gesamten Code aus der Datei tndr-hx.user.js und füge ihn dort ein.

Klicke oben rechts auf "Speichern" (oder drücke Strg + S).

🎮 Wie starte ich Tndr-HX?

Um das Tool zu nutzen, müssen beide Teile gleichzeitig laufen, da sie miteinander "sprechen".

Starte das Backend: Führe die .exe (oder die .py Datei) per Doppelklick aus. Es öffnet sich ein kleines Kontrollfenster. Lass dieses Fenster einfach im Hintergrund offen.

Öffne Tandro: Gehe im Browser auf den Tandro Chat (tandro.de).

Fertig! Oben links im Chat taucht nun das Tndr-HX Logo auf. Das Menü sollte dir anzeigen: 🟢 [Raum-Nummer] und 🐍 Backend OK.

(Hinweis: Wenn das Backend oder das Frontend fehlt, wird dir im jeweils anderen Programm eine große rote Warnmeldung mit Download-Link angezeigt!)

💡 Wie funktionieren die Features?

Hier ist eine kurze Erklärung, wie du die mächtigsten Werkzeuge des Skripts nutzt:

🎭 Avatare in deinen Vault klauen

Damit Tndr-HX die Bilder in deinen Account hochladen kann, muss es zuerst wissen, wie dein Account funktioniert.

Öffne im Tandro-Chat ganz normal deinen Kleiderschrank und lade einmalig irgendeinen Avatar hoch.

Das Skript hat nun unsichtbar das Tandro-API-Format und deinen Token gelernt!

Gehe nun im Tndr-HX Menü auf den Tab "Avatare". Dort tauchen alle Avatare auf, die gerade im Raum sind. Klicke auf ein Bild, und es landet (ohne Metadaten/EXIF) sicher in deinem Account!

🥷 Emojis klauen

Sobald jemand im Chat ein Emoji postet, fahre einfach mit der Maus darüber.

Es erscheint ein kleiner [+] Button. Klicke ihn an!

Das Emoji ist nun in deinem Tndr-HX Menü unter "Emojis" gespeichert und du kannst es ab sofort selbst verschicken.

💰 Marktplatz-Manager & Schnell-Verkauf

Laden & Pushen: Gehe in den Tab "Markt" und klicke auf Angebote laden. Das Skript durchsucht nun alle Seiten des Marktes nach deinen Items. Danach kannst du mit 🚀 Alle Pushen alle deine Items auf einen Schlag wieder auf Seite 1 befördern!

Schnell-Verkauf: Öffne im Spiel deinen Avatar-Kleiderschrank. Die Avatare tauchen nun oben im Markt-Tab auf. Trage einen Preis ein, klicke die Avatare an, und sie sind sofort auf dem Markt!

🤖 Auto-Market (Automatisch Pushen)

Willst du, dass deine Angebote immer ganz oben stehen, ohne dass du etwas tun musst?

Gehe in das Backend-Fenster (die .exe oder .py).

Aktiviere im Bereich "Auto-Market" den Haken bei Auto-Refresh aktiv.

Stelle das Intervall ein (z.B. 5 Minuten).

Das Backend befiehlt dem Browser nun alle 5 Minuten lautlos im Hintergrund, alle deine Angebote auf Platz 1 zu pushen! (Minimal 5 Minuten, um Tandro-Banns wegen Spamming zu verhindern).
