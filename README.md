# Tndr-HX: Die erweiterte Tandro Suite

Willkommen bei Tndr-HX! Dieses Projekt ist ein mächtiges Hilfsprogramm, das dir viele lästige Handgriffe im Tandro-Chat abnimmt.

Damit Tndr-HX einwandfrei funktioniert, besteht es immer aus **zwei Teilen**, die miteinander kommunizieren:

1. **Das Hintergrundprogramm (Backend):** Ein kleines Programm auf deinem PC, das sich um automatische Timer kümmert und deine geklauten Emojis oder Makros speichert.
2. **Die Browser-Erweiterung (Frontend):** Ein Menü, das direkt in den Tandro-Chat eingebaut wird, damit du alles bequem per Mausklick steuern kannst.

## Hauptfunktionen im Überblick

* **Profil-Inspektor:** Ein Klick auf das Detektiv-Icon neben einem Namen im Chat zeigt dir sofort alle Account-Daten, das Level, Aktivitätspunkte und das volle Profil-Banner in Originalauflösung an.
* **Bild-Vorschau im Chat (Auto-Embed):** Das Skript erkennt gepostete Bild-Links (wie z. B. von Discord oder Imgur) und bettet sie sofort als echte, sichtbare Bilder direkt in den Chatverlauf ein. Kein lästiges Klicken auf externe Links mehr!
* **Avatar-Speicher & Globaler Scanner:** Du siehst einen coolen Avatar im Chat? Klicke ihn im Tndr-HX Menü an, und er wird sofort in deinen eigenen Tandro-Kleiderschrank kopiert. Über den "Online-User Scannen"-Button greifst du zudem blitzschnell auf die Avatare *aller* aktuell eingeloggten Spieler zu.
* **Emoji-Sammler:** Speichere Emojis von anderen Nutzern direkt aus dem Chatverlauf und nutze sie danach selbst.
* **Marktplatz-Automat:** Verwalte alle deine Verkäufe an einem Ort. Du kannst einstellen, dass das Hintergrundprogramm deine Angebote vollautomatisch alle paar Minuten auf Platz 1 pusht, selbst wenn du gerade in einem anderen Tab bist (Anti-Throttling schützt die Verbindung dabei vor Abbrüchen).
* **Erweiterte Blockliste & Makros:** Blockiere nicht nur Nutzer, sondern auch bestimmte nervige Wörter. Speichere dir außerdem fertige Text-Bausteine (Makros) ab, um sie schnell in den Chat zu senden.
* **Integriertes Auto-Update:** Du verpasst nie wieder neue Funktionen. Das System prüft alle 12 Stunden auf GitHub nach Updates und zeigt dir oben im Menü einen grünen Banner an, wenn eine neue Version bereitsteht.

## Schritt-für-Schritt Installationsanleitung

Da das System aus zwei Teilen besteht, dauert die erste Einrichtung etwa zwei bis drei Minuten. Folge einfach diesen Schritten:

### Teil 1: Das Hintergrundprogramm installieren

Dies ist das Programm, das als dein lokaler Speicherplatz dient.

1. Gehe in diesem Projekt auf die Seite **Releases** (meistens rechts auf der Seite zu finden).
2. Lade dir die Datei `Tndr-HX_backend.exe` herunter und speichere sie in einem eigenen Ordner (z. B. auf deinem Desktop). In diesem Ordner speichert das Programm später deine Einstellungen.
3. **Wichtiger Hinweis zu Windows:** Wenn du die `.exe` das erste Mal startest, meldet sich eventuell der blaue *Windows SmartScreen* und warnt vor einem unbekannten Programm. Klicke dort einfach auf **"Weitere Informationen"** und dann auf **"Trotzdem ausführen"**.
4. Lass das kleine schwarze Fenster, das sich nun öffnet, einfach im Hintergrund laufen.

> **Tipp für Fortgeschrittene:** Wer kein `.exe`-Programm ausführen möchte, kann sich stattdessen die Datei `Tndr-HX_backend.py` herunterladen und sie manuell über eine eigene Python 3 Installation starten.

### Teil 2: Die Browser-Erweiterung installieren

Dieser Teil sorgt dafür, dass das Menü im Chat auftaucht.

1. Lade dir die kostenlose Browser-Erweiterung **Violentmonkey** herunter (Verfügbar für Chrome, Edge, Firefox und Opera).
2. Klicke oben rechts in deinem Browser auf das Violentmonkey-Symbol und wähle das **Plus-Symbol (+)**, um ein neues Skript zu erstellen.
3. Lösche den Platzhalter-Text, der dort bereits steht, komplett heraus.
4. Öffne in diesem Projekt die Datei `Tndr-HX_client.js` (oder die `.user.js`), kopiere den gesamten Code und füge ihn in Violentmonkey ein.
5. Klicke oben rechts auf **Speichern**.

Wenn nun das Hintergrundprogramm läuft und du den Tandro-Chat öffnest, bist du verbunden! Fehlt eines von beiden, zeigt dir das System eine große rote Warnmeldung an.

*(Hinweis: Durch die direkte API-Integration ist **kein manuelles "Anlernen"** des Skripts mehr nötig. Alle Funktionen sind ab der ersten Sekunde sofort einsatzbereit!)*

## Kurzanleitung für die wichtigsten Funktionen

**Wie inspiziere ich Profile?**
Fahre im Chat mit der Maus über den Namen eines Nutzers. Es erscheint ein kleines Detektiv-Symbol (🕵️‍♀️). Ein Klick darauf öffnet automatisch den Tab **Profil** im Panel und zeigt dir alle versteckten Server-Daten, das Profil-Banner und den Kontostand an Aktivitätspunkten dieses Nutzers.

**Wie klaue ich Emojis?**
Fahre im Chat einfach mit der Maus über ein Emoji, das ein anderer Nutzer gesendet hat. Es taucht ein kleiner Plus-Button auf. Ein Klick darauf speichert das Bild in deinem Tndr-HX Menü.

**Wie klaue ich Avatare?**
Wechsle in den Tab **Klauen**. Hier siehst du die Avatare aus deinem aktuellen Raum. Willst du mehr? Klicke auf **"🌍 Online-User Scannen"**, um die Avatare *aller* aktuell eingeloggten Spieler des gesamten Servers zu laden. Ein Klick auf ein Bild speichert es direkt in deinem Account.

**Wie verkaufe ich Avatare schneller?**
Wechsle im Tndr-HX Menü auf den Tab **Markt** und klicke auf **"👗 Kleiderschrank laden"**. Das Skript holt deine Avatare direkt über die API. Trage oben einen Preis ein und klicke auf die Bilder, um sie sofort in den Markt zu stellen. (Das Skript formatiert sie automatisch in die Kategorie "Sonstiges").

**Wie aktiviere ich den automatischen Marktplatz-Pusher?**

1. Wechsle in das schwarze Fenster des Hintergrundprogramms (Backend).
2. Aktiviere dort den Haken bei **Auto-Refresh aktivieren**.
3. Stelle die Minuten ein (Ich empfehle 5 bis 10 Minuten, um den Chat-Server nicht zu überlasten) und klicke auf Speichern.
4. Das Backend gibt dem Browser nun lautlos den Befehl, all deine Angebote regelmäßig wieder nach ganz oben zu setzen!
