# Tndr-HX: Die erweiterte Tandro Suite


Damit Tndr-HX einwandfrei funktioniert, besteht es immer aus **zwei Teilen**, die miteinander kommunizieren:
1. **Das Hintergrundprogramm (Backend):** Ein kleines Programm auf deinem PC, das sich um automatische Timer kümmert und deine geklauten Emojis oder Makros speichert.
2. **Die Browser-Erweiterung (Frontend):** Ein Menü, das direkt in den Tandro-Chat eingebaut wird, damit du alles bequem per Mausklick steuern kannst.

---

## Hauptfunktionen im Überblick

* **Avatar-Speicher (Vault-Stealer):** Du siehst einen coolen Avatar im Chat? Klicke ihn an, und er wird sofort – ohne störende Hintergrunddaten – in deinen eigenen Tandro-Kleiderschrank kopiert.
* **Emoji-Sammler:** Speichere Emojis von anderen Nutzern direkt aus dem Chatverlauf und nutze sie danach selbst.
* **Marktplatz-Automat:** Verwalte alle deine Verkäufe an einem Ort. Du kannst einstellen, dass das Hintergrundprogramm deine Angebote vollautomatisch alle paar Minuten auf Platz 1 pusht, selbst wenn du gerade in einem anderen Tab bist.
* **Erweiterte Blockliste & Makros:** Blockiere nicht nur Nutzer, sondern auch bestimmte nervige Wörter. Speichere dir außerdem fertige Text-Bausteine (Makros) ab, um sie schnell in den Chat zu senden.

---

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
4. Öffne in diesem Projekt die Datei `Tndr-HX_client.js`, kopiere den gesamten Code und füge ihn in Violentmonkey ein.
5. Klicke oben rechts auf **Speichern**. 

Wenn nun das Hintergrundprogramm läuft und du den Tandro-Chat öffnest, bist du verbunden! Fehlt eines von beiden, zeigt dir das System eine große rote Warnmeldung an.

---

## Der erste Start: Das Skript "anlernen"

Tandro nutzt versteckte Sicherheitsschlüssel, um zu verhindern, dass fremde Programme einfach Bilder in deinen Account laden. Daher muss Tndr-HX einmalig lernen, wie dein persönlicher Account funktioniert.

**So funktioniert der Lern-Vorgang:**
1. Öffne den Tandro-Chat und logge dich ein.
2. Gehe ganz normal über das Menü des Spiels in deinen Kleiderschrank.
3. Lade **einmalig einen beliebigen Avatar** über das normale Spiel-Menü hoch.
4. *Fertig!* Tndr-HX hat diesen Vorgang unsichtbar beobachtet, das Datenformat verstanden und deinen Sicherheitsschlüssel gelernt. Ab jetzt funktioniert der automatische Avatar-Diebstahl reibungslos.

---

## Kurzanleitung für die wichtigsten Funktionen

**Wie klaue ich Emojis?**
Fahre im Chat einfach mit der Maus über ein Emoji, das ein anderer Nutzer gesendet hat. Es taucht ein kleiner Plus-Button auf. Ein Klick darauf speichert das Bild in deinem Tndr-HX Menü.

**Wie verkaufe ich Avatare schneller?**
Öffne im Tandro-Chat deinen Kleiderschrank und wechsle dann im Tndr-HX Menü auf den Tab **Markt**. Dort siehst du nun alle deine Avatare. Trage oben einen Preis ein und klicke auf die Bilder, um sie sofort in den Markt zu stellen.

**Wie aktiviere ich den automatischen Marktplatz-Pusher?**
1. Wechsle in das schwarze Fenster des Hintergrundprogramms (Backend).
2. Aktiviere dort den Haken bei **Auto-Refresh aktivieren**.
3. Stelle die Minuten ein (wir empfehlen 5 bis 10 Minuten, um den Chat-Server nicht zu überlasten) und klicke auf Speichern.
4. Das Backend gibt dem Browser nun lautlos den Befehl, all deine Angebote regelmäßig wieder nach ganz oben zu setzen!
