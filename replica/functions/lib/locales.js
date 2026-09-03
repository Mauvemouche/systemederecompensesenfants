"use strict";

const DEFAULT_LOCALE = "nl";

const fr = {
  "err.unauthenticated": "Connecte-toi pour continuer.",
  "err.emailInUse": "Cet email est déjà utilisé. Connecte-toi.",
  "err.invalidEmail": "Email invalide.",
  "err.weakPassword": "Mot de passe trop faible (6 caractères min.).",
  "err.emailNotConfigured":
    "L’envoi d’email n’est pas encore configuré. Réessaie plus tard, ou écris à contact@kidsrewardsystem.com.",
  "err.resendWait": "Attends une minute avant de renvoyer le code.",
  "err.mailFailed": "Impossible d’envoyer l’email. Réessaie dans un instant.",
  "err.verifyMailFailed": "Impossible d’envoyer l’email de vérification. Réessaie dans un instant.",
  "err.codeSixDigits": "Le code doit contenir 6 chiffres.",
  "err.codeExpired": "Ce code a expiré. Demande-en un nouveau.",
  "err.codeLocked": "Trop d’essais. Demande un nouveau code.",
  "err.codeWrong": "Code incorrect.",
  "err.accountMissing": "Compte introuvable. Recommence l’inscription.",
  "err.familyMissing": "Famille non initialisée.",
  "err.ownerOnly": "Seul le parent titulaire peut faire ça.",
  "err.pinFourDigits": "Le code Admin doit contenir 4 chiffres.",
  "err.pinExists": "Un code Admin existe déjà. Utilise « Changer le code Admin ».",
  "err.pinChooseFirst": "Choisis d’abord un code Admin.",
  "err.pinLocked": "Trop d’essais. Utilise « Récupérer le code Admin » ou réessaie plus tard.",
  "err.pinWrong": "Code incorrect.",
  "err.pinCurrentWrong": "Code actuel incorrect.",
  "err.noOwnerEmail": "Aucun email titulaire pour envoyer le code.",
  "err.recoverWait": "Un email de récupération a déjà été envoyé. Réessaie dans 15 minutes.",
  "err.subscriptionActive": "Un abonnement est déjà actif.",
  "err.originHttps": "origin HTTPS requis.",
  "err.sessionSandbox": "sessionId sandbox (cs_test_…) requis. Les sessions live sont refusées.",
  "err.sessionLive": "sessionId live (cs_live_…) requis sur kidsrewardsystem.",
  "err.liveEvent": "Événement live refusé (sandbox only).",
  "err.testEvent": "Événement test refusé (live only).",
  "err.sessionOtherFamily": "Cette session Stripe appartient à une autre famille.",
  "err.noStripeCustomer": "Pas encore de client Stripe.",
  "err.originRequired": "origin requis.",
  "err.subscriptionRequired": "Abonnement requis.",
  "err.childNames": "Indique entre 1 et 6 prénoms.",
  "err.personRequired": "Personne requise.",
  "err.invalidName": "Le prénom doit faire entre 1 et 40 caractères.",
  "err.personNotFound": "Personne introuvable.",
  "err.internalFamily": "Impossible de créer la famille.",
  "err.acceptedLegal": "Accepte les conditions et la politique de confidentialité pour créer un compte.",
  "err.tosNotAccepted": "Accepte les conditions et la politique de confidentialité pour créer un compte.",
  "err.createUserFailed": "Impossible de créer le compte. Réessaie dans un instant.",
  "err.referralOnce": "Le parrainage de cette famille est déjà enregistré.",
  "err.referralName": "Indique un prénom et un nom (sans lien ni email), ou passe cette étape.",
  "err.resetMailFailed": "Impossible d’envoyer l’email de réinitialisation. Réessaie dans un instant.",
  "email.fromName": "Système de récompenses",
  "email.signoff": "À très vite !",
  "email.dad": "Un papa belge",
  "email.welcome.subject": "Bienvenue — ton code de vérification",
  "email.welcome.title": "Bienvenue 👋",
  "email.welcome.body":
    "Salut, et merci de nous rejoindre. Je suis un papa belge : j’ai construit cette appli pour que les familles puissent suivre les <b>tâches des enfants</b>, gagner des <b>étoiles</b>, et transformer ça en <b>temps d’écran</b> — sans se battre tous les soirs.",
  "email.welcome.bodyText":
    "Salut, et merci de nous rejoindre. Je suis un papa belge : j’ai construit cette appli pour que les familles puissent suivre les tâches des enfants, gagner des étoiles, et transformer ça en temps d’écran.",
  "email.welcome.identityNote":
    "(mon nom ne sera dévoilé qu'aux utilisateurs payants après la période d’essai, pour éviter les spams et vol d’identité)",
  "email.welcome.signoff": "À vous de jouer ! 😉",
  "email.welcome.codeIntro": "Voici ton code de vérification (valable 15 minutes) :",
  "email.welcome.codeExpiry": "Ce code expire après 15 minutes.",
  "email.welcome.afterCode":
    "Entre-le dans l’appli <b>avant</b> de te connecter. Tant que ce n’est pas validé, le compte reste fermé.",
  "email.welcome.afterCodeText": "Entre-le dans l’appli avant de te connecter.",
  "email.welcome.adminTitle": "Le mode Admin, en deux mots",
  "email.welcome.admin1":
    "Au <b>premier accès</b>, tu choisis un code Admin à <b>4 chiffres</b>. Garde-le précieusement : on ne te l’envoie pas maintenant.",
  "email.welcome.admin2": "En mode Admin, tu peux le changer (« <b>Changer le code Admin</b> »).",
  "email.welcome.admin3":
    "Si tu n’es pas en mode Admin et que tu as oublié le code, utilise « <b>Récupérer le code Admin</b> ». On t’envoie un <b>nouveau</b> code à 4 chiffres par email, et l’ancien ne fonctionne plus.",
  "email.welcome.adminText":
    "Mode Admin :\n- Au premier accès, tu choisis un code Admin à 4 chiffres. Garde-le précieusement : on ne te l’envoie pas maintenant.\n- En mode Admin, tu peux le changer (« Changer le code Admin »).\n- Si tu n’es pas en mode Admin et que tu as oublié le code, utilise « Récupérer le code Admin ». On t’envoie un nouveau code à 4 chiffres par email, et l’ancien ne fonctionne plus.",
  "email.welcome.pricesTitle": "Les prix",
  "email.welcome.prices":
    "<b>2,50 €/mois</b> (ça ferait 30 €/an si tu restes au mois) ou <b>25 €/an</b>. Premier mois d’essai, avec carte enregistrée. J’ai mis le prix autour d’une bière (ou d’un café) par mois, parce que c’est un père belge qui l’a construite — pas pour s’acheter une Ferrari, juste pour payer le serveur (et à la base pour trouver une solution à la gestion du temps d'écran de ses propres enfants en insistant sur le côté récompense et responsabilités).",
  "email.welcome.pricesText":
    "Prix : 2,50 €/mois (30 €/an si payé mois par mois) ou 25 €/an. Premier mois d’essai, avec carte enregistrée. Prix autour d’une bière (ou d’un café) par mois, parce qu’un père belge l’a construite — pas pour s’acheter une Ferrari, juste pour payer le serveur (et à la base pour trouver une solution à la gestion du temps d'écran de ses propres enfants en insistant sur le côté récompense et responsabilités).",
  "email.welcome.contact":
    "Une idée, une plainte, un « ça bug » ? Écris à <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a>. Pour une plainte, tu peux aussi écrire à kidsrewardsystem@proton.me.",
  "email.welcome.contactText":
    "Suggestions / plaintes : contact@kidsrewardsystem.com (plaintes aussi : kidsrewardsystem@proton.me)",
  "email.welcome.dailyEmail":
    "Tu recevras un résumé quotidien par email. Tu pourras le désactiver sur l’écran d’accueil.",
  "email.welcome.dailyEmailText":
    "Tu recevras un résumé quotidien par email. Tu pourras le désactiver sur l’écran d’accueil.",
  "email.recover.subject": "Nouveau code Admin",
  "email.recover.title": "Nouveau code Admin",
  "email.recover.body":
    "Quelqu’un a demandé à récupérer le code Admin de ta famille. L’ancien code ne fonctionne plus. Voici le nouveau (4 chiffres) :",
  "email.recover.after":
    "En mode Admin, tu pourras le changer. Si tu n’as pas fait cette demande, change le code dès que tu peux, et écris-nous à <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a> (plaintes : kidsrewardsystem@proton.me).",
  "email.recover.afterText":
    "En mode Admin, tu pourras le changer. Si tu n’as pas fait cette demande, écris à contact@kidsrewardsystem.com (plaintes : kidsrewardsystem@proton.me).",
  "email.reset.subject": "Ton code pour réinitialiser le mot de passe",
  "email.reset.title": "Réinitialiser le mot de passe",
  "email.reset.body":
    "Quelqu’un a demandé à changer le mot de passe de ce compte. Voici le code à 6 chiffres (valable 15 minutes) :",
  "email.reset.after":
    "Entre-le dans l’appli avec ton nouveau mot de passe. Si tu n’as pas fait cette demande, ignore cet email.",
  "email.reset.afterText":
    "Entre-le dans l’appli avec ton nouveau mot de passe. Si tu n’as pas fait cette demande, ignore cet email.",
  "email.daily.subject": "✅ Rapport Quotidien - {dayName} {date}",
  "email.daily.title": "Rapport",
  "email.daily.heading": "✅ Rapport — {dayName} {date}",
  "email.daily.reset": "Reset",
  "email.daily.deletion": "Suppression",
  "email.daily.globalScore": "Score global",
  "email.daily.member": "Membre",
  "email.daily.scoreDetails": "Score & détails",
  "email.daily.normal": "Normal",
  "email.daily.bonus": "Bonus",
  "email.daily.penalties": "Pénalités",
  "email.daily.seriousFault": "Faute grave",
  "email.daily.yes": "OUI",
  "email.daily.no": "non",
  "email.daily.tasks": "tâches",
  "email.daily.monthly": "Mensuel",
  "email.daily.monthlyReset": "reset mensuel effectué (1er jour du mois).",
  "email.daily.oneOff": "Ponctuel",
  "email.daily.oneOffDeleted": "{count} tâche(s) supprimée(s).",
  "email.daily.footer": "Rapport généré automatiquement — Système de récompenses",
  "email.daily.day.0": "Dimanche",
  "email.daily.day.1": "Lundi",
  "email.daily.day.2": "Mardi",
  "email.daily.day.3": "Mercredi",
  "email.daily.day.4": "Jeudi",
  "email.daily.day.5": "Vendredi",
  "email.daily.day.6": "Samedi",
  "email.legalHtml":
    "<a href=\"{origin}/privacy.html\">Confidentialité</a> · <a href=\"{origin}/terms.html\">Conditions</a>",
  "email.legalText": "Confidentialité : {origin}/privacy.html\nConditions : {origin}/terms.html",
};

const nl = {
  "err.unauthenticated": "Meld je aan om verder te gaan.",
  "err.emailInUse": "Dit e-mailadres is al in gebruik. Log in.",
  "err.invalidEmail": "Ongeldig e-mailadres.",
  "err.weakPassword": "Wachtwoord te zwak (minstens 6 tekens).",
  "err.emailNotConfigured":
    "E-mail is nog niet ingesteld. Probeer later opnieuw, of schrijf naar contact@kidsrewardsystem.com.",
  "err.resendWait": "Wacht een minuut voor je de code opnieuw verstuurt.",
  "err.mailFailed": "De e-mail kon niet worden verstuurd. Probeer zo meteen opnieuw.",
  "err.verifyMailFailed": "De verificatiemail kon niet worden verstuurd. Probeer zo meteen opnieuw.",
  "err.codeSixDigits": "De code moet 6 cijfers hebben.",
  "err.codeExpired": "Deze code is verlopen. Vraag een nieuwe aan.",
  "err.codeLocked": "Te veel pogingen. Vraag een nieuwe code aan.",
  "err.codeWrong": "Onjuiste code.",
  "err.accountMissing": "Account niet gevonden. Begin de inschrijving opnieuw.",
  "err.familyMissing": "Gezin nog niet ingesteld.",
  "err.ownerOnly": "Alleen de ouder-titularis mag dit doen.",
  "err.pinFourDigits": "De Admin-code moet 4 cijfers hebben.",
  "err.pinExists": "Er is al een Admin-code. Gebruik « Admin-code wijzigen ».",
  "err.pinChooseFirst": "Kies eerst een Admin-code.",
  "err.pinLocked": "Te veel pogingen. Gebruik « Admin-code terughalen » of probeer later opnieuw.",
  "err.pinWrong": "Onjuiste code.",
  "err.pinCurrentWrong": "Huidige code onjuist.",
  "err.noOwnerEmail": "Geen e-mailadres van de titularis om de code naartoe te sturen.",
  "err.recoverWait": "Er is al een herstelmail verstuurd. Probeer over 15 minuten opnieuw.",
  "err.subscriptionActive": "Er is al een abonnement actief.",
  "err.originHttps": "HTTPS-origin vereist.",
  "err.sessionSandbox": "Sandbox-sessionId (cs_test_…) vereist. Live sessies worden geweigerd.",
  "err.sessionLive": "Live-sessionId (cs_live_…) vereist op kidsrewardsystem.",
  "err.liveEvent": "Live-event geweigerd (alleen sandbox).",
  "err.testEvent": "Test-event geweigerd (alleen live).",
  "err.sessionOtherFamily": "Deze Stripe-sessie hoort bij een ander gezin.",
  "err.noStripeCustomer": "Nog geen Stripe-klant.",
  "err.originRequired": "origin vereist.",
  "err.subscriptionRequired": "Abonnement vereist.",
  "err.childNames": "Geef 1 tot 6 voornamen op.",
  "err.personRequired": "Persoon vereist.",
  "err.invalidName": "De voornaam moet 1 tot 40 tekens hebben.",
  "err.personNotFound": "Persoon niet gevonden.",
  "err.internalFamily": "Het gezin kon niet worden aangemaakt.",
  "err.acceptedLegal": "Aanvaard de voorwaarden en de privacyverklaring om een account aan te maken.",
  "err.tosNotAccepted": "Aanvaard de voorwaarden en de privacyverklaring om een account aan te maken.",
  "err.createUserFailed": "Het account kon niet worden aangemaakt. Probeer zo meteen opnieuw.",
  "err.referralOnce": "De doorverwijzing van dit gezin is al opgeslagen.",
  "err.referralName": "Vul een voornaam en naam in (geen link of e-mail), of sla deze stap over.",
  "err.resetMailFailed": "De herstelmail kon niet worden verstuurd. Probeer zo meteen opnieuw.",
  "email.fromName": "Beloningssysteem",
  "email.signoff": "Tot gauw!",
  "email.dad": "Een Belgische papa",
  "email.welcome.subject": "Welkom — je verificatiecode",
  "email.welcome.title": "Welkom 👋",
  "email.welcome.body":
    "Hallo, en welkom. Ik ben een Belgische papa: ik heb deze app gemaakt zodat gezinnen de <b>taken van de kinderen</b> kunnen volgen, <b>sterren</b> kunnen verdienen, en dat omzetten in <b>schermtijd</b> — zonder elke avond ruzie.",
  "email.welcome.bodyText":
    "Hallo, en welkom. Ik ben een Belgische papa: ik heb deze app gemaakt zodat gezinnen de taken van de kinderen kunnen volgen, sterren kunnen verdienen, en dat omzetten in schermtijd.",
  "email.welcome.identityNote":
    "(mijn naam wordt alleen onthuld aan betalende gebruikers na de proefperiode, om spam en identiteitsdiefstal te vermijden)",
  "email.welcome.signoff": "Aan jou om te spelen! 😉",
  "email.welcome.codeIntro": "Hier is je verificatiecode (15 minuten geldig):",
  "email.welcome.codeExpiry": "Deze code vervalt na 15 minuten.",
  "email.welcome.afterCode":
    "Vul hem in de app in <b>vóór</b> je inlogt. Tot die tijd blijft het account gesloten.",
  "email.welcome.afterCodeText": "Vul hem in de app in vóór je inlogt.",
  "email.welcome.adminTitle": "De Admin-modus, in het kort",
  "email.welcome.admin1":
    "Bij de <b>eerste toegang</b> kies je een Admin-code van <b>4 cijfers</b>. Onthoud hem goed: we sturen hem nu niet per mail.",
  "email.welcome.admin2": "In Admin-modus kun je hem wijzigen (« <b>Admin-code wijzigen</b> »).",
  "email.welcome.admin3":
    "Als je niet in Admin-modus bent en de code vergeten bent, gebruik « <b>Admin-code terughalen</b> ». We mailen een <b>nieuwe</b> code van 4 cijfers, en de oude werkt niet meer.",
  "email.welcome.adminText":
    "Admin-modus:\n- Bij de eerste toegang kies je een Admin-code van 4 cijfers. Onthoud hem goed: we sturen hem nu niet per mail.\n- In Admin-modus kun je hem wijzigen (« Admin-code wijzigen »).\n- Als je niet in Admin-modus bent en de code vergeten bent, gebruik « Admin-code terughalen ». We mailen een nieuwe code van 4 cijfers, en de oude werkt niet meer.",
  "email.welcome.pricesTitle": "De prijzen",
  "email.welcome.prices":
    "<b>2,50 €/maand</b> (dat zou 30 €/jaar zijn als je maandelijks betaalt) of <b>25 €/jaar</b>. Eerste maand proef, met geregistreerde kaart. Ik heb de prijs rond een pintje (of een koffie) per maand gezet, omdat een Belgische vader dit gebouwd heeft — niet voor een Ferrari, gewoon om de server te betalen (en in de eerste plaats om een oplossing te vinden voor de schermtijd van zijn eigen kinderen, met nadruk op beloning en verantwoordelijkheden).",
  "email.welcome.pricesText":
    "Prijzen: 2,50 €/maand (30 €/jaar als je maandelijks betaalt) of 25 €/jaar. Eerste maand proef, met geregistreerde kaart. Prijs rond een pintje (of een koffie) per maand, omdat een Belgische vader dit gebouwd heeft — niet voor een Ferrari, gewoon om de server te betalen (en in de eerste plaats om een oplossing te vinden voor de schermtijd van zijn eigen kinderen, met nadruk op beloning en verantwoordelijkheden).",
  "email.welcome.contact":
    "Een idee, een klacht, een « het bugt »? Schrijf naar <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a>. Voor een klacht kun je ook schrijven naar kidsrewardsystem@proton.me.",
  "email.welcome.contactText":
    "Suggesties / klachten: contact@kidsrewardsystem.com (klachten ook: kidsrewardsystem@proton.me)",
  "email.welcome.dailyEmail":
    "Je krijgt dagelijks een samenvatting per e-mail. Je kunt dat uitzetten op het startscherm.",
  "email.welcome.dailyEmailText":
    "Je krijgt dagelijks een samenvatting per e-mail. Je kunt dat uitzetten op het startscherm.",
  "email.recover.subject": "Nieuwe Admin-code",
  "email.recover.title": "Nieuwe Admin-code",
  "email.recover.body":
    "Iemand heeft gevraagd de Admin-code van je gezin terug te halen. De oude code werkt niet meer. Hier is de nieuwe (4 cijfers):",
  "email.recover.after":
    "In Admin-modus kun je hem wijzigen. Als jij deze aanvraag niet hebt gedaan, wijzig de code zo snel je kunt en schrijf naar <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a> (klachten: kidsrewardsystem@proton.me).",
  "email.recover.afterText":
    "In Admin-modus kun je hem wijzigen. Als jij deze aanvraag niet hebt gedaan, schrijf naar contact@kidsrewardsystem.com (klachten: kidsrewardsystem@proton.me).",
  "email.reset.subject": "Je code om het wachtwoord te herstellen",
  "email.reset.title": "Wachtwoord herstellen",
  "email.reset.body":
    "Iemand heeft gevraagd het wachtwoord van dit account te wijzigen. Hier is de code van 6 cijfers (15 minuten geldig):",
  "email.reset.after":
    "Vul hem in de app in samen met je nieuwe wachtwoord. Als jij dit niet hebt gevraagd, negeer deze e-mail.",
  "email.reset.afterText":
    "Vul hem in de app in samen met je nieuwe wachtwoord. Als jij dit niet hebt gevraagd, negeer deze e-mail.",
  "email.daily.subject": "✅ Dagelijks rapport - {dayName} {date}",
  "email.daily.title": "Rapport",
  "email.daily.heading": "✅ Rapport — {dayName} {date}",
  "email.daily.reset": "Reset",
  "email.daily.deletion": "Verwijdering",
  "email.daily.globalScore": "Globale score",
  "email.daily.member": "Lid",
  "email.daily.scoreDetails": "Score & details",
  "email.daily.normal": "Normaal",
  "email.daily.bonus": "Bonus",
  "email.daily.penalties": "Straffen",
  "email.daily.seriousFault": "Ernstige fout",
  "email.daily.yes": "JA",
  "email.daily.no": "nee",
  "email.daily.tasks": "taken",
  "email.daily.monthly": "Maandelijks",
  "email.daily.monthlyReset": "maandelijkse reset uitgevoerd (1e dag van de maand).",
  "email.daily.oneOff": "Eenmalig",
  "email.daily.oneOffDeleted": "{count} taak/taken verwijderd.",
  "email.daily.footer": "Rapport automatisch gegenereerd — Beloningssysteem",
  "email.daily.day.0": "Zondag",
  "email.daily.day.1": "Maandag",
  "email.daily.day.2": "Dinsdag",
  "email.daily.day.3": "Woensdag",
  "email.daily.day.4": "Donderdag",
  "email.daily.day.5": "Vrijdag",
  "email.daily.day.6": "Zaterdag",
  "email.legalHtml":
    "<a href=\"{origin}/privacy.html\">Privacy</a> · <a href=\"{origin}/terms.html\">Voorwaarden</a>",
  "email.legalText": "Privacy: {origin}/privacy.html\nVoorwaarden: {origin}/terms.html",
};

const de = {
  "err.unauthenticated": "Melde dich an, um fortzufahren.",
  "err.emailInUse": "Diese E-Mail wird bereits verwendet. Melde dich an.",
  "err.invalidEmail": "Ungültige E-Mail-Adresse.",
  "err.weakPassword": "Passwort zu schwach (mindestens 6 Zeichen).",
  "err.emailNotConfigured":
    "E-Mail ist noch nicht eingerichtet. Versuch es später erneut oder schreib an contact@kidsrewardsystem.com.",
  "err.resendWait": "Warte eine Minute, bevor du den Code erneut sendest.",
  "err.mailFailed": "Die E-Mail konnte nicht gesendet werden. Versuch es gleich noch einmal.",
  "err.verifyMailFailed": "Die Bestätigungs-E-Mail konnte nicht gesendet werden. Versuch es gleich noch einmal.",
  "err.codeSixDigits": "Der Code muss 6 Ziffern haben.",
  "err.codeExpired": "Dieser Code ist abgelaufen. Fordere einen neuen an.",
  "err.codeLocked": "Zu viele Versuche. Fordere einen neuen Code an.",
  "err.codeWrong": "Falscher Code.",
  "err.accountMissing": "Konto nicht gefunden. Starte die Registrierung erneut.",
  "err.familyMissing": "Familie noch nicht eingerichtet.",
  "err.ownerOnly": "Nur der hauptverantwortliche Elternteil darf das tun.",
  "err.pinFourDigits": "Der Admin-Code muss 4 Ziffern haben.",
  "err.pinExists": "Es gibt bereits einen Admin-Code. Nutze « Admin-Code ändern ».",
  "err.pinChooseFirst": "Wähle zuerst einen Admin-Code.",
  "err.pinLocked": "Zu viele Versuche. Nutze « Admin-Code wiederherstellen » oder versuch es später.",
  "err.pinWrong": "Falscher Code.",
  "err.pinCurrentWrong": "Aktueller Code falsch.",
  "err.noOwnerEmail": "Keine Inhaber-E-Mail, um den Code zu senden.",
  "err.recoverWait": "Es wurde bereits eine Wiederherstellungs-E-Mail gesendet. Versuch es in 15 Minuten erneut.",
  "err.subscriptionActive": "Ein Abo ist bereits aktiv.",
  "err.originHttps": "HTTPS-Origin erforderlich.",
  "err.sessionSandbox": "Sandbox-sessionId (cs_test_…) erforderlich. Live-Sitzungen werden abgelehnt.",
  "err.sessionLive": "Live-sessionId (cs_live_…) auf kidsrewardsystem erforderlich.",
  "err.liveEvent": "Live-Ereignis abgelehnt (nur Sandbox).",
  "err.testEvent": "Test-Ereignis abgelehnt (nur Live).",
  "err.sessionOtherFamily": "Diese Stripe-Sitzung gehört zu einer anderen Familie.",
  "err.noStripeCustomer": "Noch kein Stripe-Kunde.",
  "err.originRequired": "origin erforderlich.",
  "err.subscriptionRequired": "Abo erforderlich.",
  "err.childNames": "Gib 1 bis 6 Vornamen an.",
  "err.personRequired": "Person erforderlich.",
  "err.invalidName": "Der Vorname muss 1 bis 40 Zeichen haben.",
  "err.personNotFound": "Person nicht gefunden.",
  "err.internalFamily": "Die Familie konnte nicht erstellt werden.",
  "err.acceptedLegal": "Bitte akzeptiere die Bedingungen und die Datenschutzerklärung, um ein Konto zu erstellen.",
  "err.tosNotAccepted": "Bitte akzeptiere die Bedingungen und die Datenschutzerklärung, um ein Konto zu erstellen.",
  "err.createUserFailed": "Das Konto konnte nicht erstellt werden. Versuch es gleich noch einmal.",
  "err.referralOnce": "Die Empfehlung dieser Familie ist bereits gespeichert.",
  "err.referralName": "Gib Vor- und Nachnamen ein (kein Link und keine E-Mail), oder überspringe diesen Schritt.",
  "err.resetMailFailed": "Die Zurücksetz-E-Mail konnte nicht gesendet werden. Versuch es gleich noch einmal.",
  "email.fromName": "Belohnungssystem",
  "email.signoff": "Bis gleich!",
  "email.dad": "Ein belgischer Papa",
  "email.welcome.subject": "Willkommen — dein Bestätigungscode",
  "email.welcome.title": "Willkommen 👋",
  "email.welcome.body":
    "Hallo und willkommen. Ich bin ein belgischer Papa: Ich habe diese App gebaut, damit Familien die <b>Aufgaben der Kinder</b> verfolgen, <b>Sterne</b> sammeln und daraus <b>Bildschirmzeit</b> machen können — ohne jeden Abend Streit.",
  "email.welcome.bodyText":
    "Hallo und willkommen. Ich bin ein belgischer Papa: Ich habe diese App gebaut, damit Familien die Aufgaben der Kinder verfolgen, Sterne sammeln und daraus Bildschirmzeit machen können.",
  "email.welcome.identityNote":
    "(mein Name wird nur zahlenden Nutzerinnen und Nutzern nach der Testphase genannt, um Spam und Identitätsdiebstahl zu vermeiden)",
  "email.welcome.signoff": "Jetzt bist du am Zug! 😉",
  "email.welcome.codeIntro": "Hier ist dein Bestätigungscode (15 Minuten gültig):",
  "email.welcome.codeExpiry": "Dieser Code läuft nach 15 Minuten ab.",
  "email.welcome.afterCode":
    "Gib ihn in der App ein, <b>bevor</b> du dich anmeldest. Bis dahin bleibt das Konto gesperrt.",
  "email.welcome.afterCodeText": "Gib ihn in der App ein, bevor du dich anmeldest.",
  "email.welcome.adminTitle": "Der Admin-Modus in Kürze",
  "email.welcome.admin1":
    "Beim <b>ersten Zugang</b> wählst du einen Admin-Code mit <b>4 Ziffern</b>. Merk ihn dir gut: Wir schicken ihn jetzt nicht per E-Mail.",
  "email.welcome.admin2": "Im Admin-Modus kannst du ihn ändern (« <b>Admin-Code ändern</b> »).",
  "email.welcome.admin3":
    "Wenn du nicht im Admin-Modus bist und den Code vergessen hast, nutze « <b>Admin-Code wiederherstellen</b> ». Wir mailen einen <b>neuen</b> 4-stelligen Code, und der alte gilt nicht mehr.",
  "email.welcome.adminText":
    "Admin-Modus:\n- Beim ersten Zugang wählst du einen Admin-Code mit 4 Ziffern. Merk ihn dir gut: Wir schicken ihn jetzt nicht per E-Mail.\n- Im Admin-Modus kannst du ihn ändern (« Admin-Code ändern »).\n- Wenn du nicht im Admin-Modus bist und den Code vergessen hast, nutze « Admin-Code wiederherstellen ». Wir mailen einen neuen 4-stelligen Code, und der alte gilt nicht mehr.",
  "email.welcome.pricesTitle": "Die Preise",
  "email.welcome.prices":
    "<b>2,50 €/Monat</b> (das wären 30 €/Jahr bei monatlicher Zahlung) oder <b>25 €/Jahr</b>. Erster Monat zur Probe, mit hinterlegter Karte. Ich habe den Preis um ein Bier (oder einen Kaffee) pro Monat gesetzt, weil ein belgischer Vater das gebaut hat — nicht für einen Ferrari, nur um den Server zu zahlen (und ursprünglich, um eine Lösung für die Bildschirmzeit seiner eigenen Kinder zu finden, mit Betonung auf Belohnung und Verantwortung).",
  "email.welcome.pricesText":
    "Preise: 2,50 €/Monat (30 €/Jahr bei monatlicher Zahlung) oder 25 €/Jahr. Erster Monat zur Probe, mit hinterlegter Karte. Preis um ein Bier (oder einen Kaffee) pro Monat, weil ein belgischer Vater das gebaut hat — nicht für einen Ferrari, nur um den Server zu zahlen (und ursprünglich, um eine Lösung für die Bildschirmzeit seiner eigenen Kinder zu finden, mit Betonung auf Belohnung und Verantwortung).",
  "email.welcome.contact":
    "Eine Idee, eine Beschwerde, ein « das bugt »? Schreib an <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a>. Beschwerden auch an kidsrewardsystem@proton.me.",
  "email.welcome.contactText":
    "Ideen / Beschwerden: contact@kidsrewardsystem.com (Beschwerden auch: kidsrewardsystem@proton.me)",
  "email.welcome.dailyEmail":
    "Du bekommst eine tägliche Zusammenfassung per E-Mail. Du kannst sie auf dem Startbildschirm abschalten.",
  "email.welcome.dailyEmailText":
    "Du bekommst eine tägliche Zusammenfassung per E-Mail. Du kannst sie auf dem Startbildschirm abschalten.",
  "email.recover.subject": "Neuer Admin-Code",
  "email.recover.title": "Neuer Admin-Code",
  "email.recover.body":
    "Jemand hat den Admin-Code deiner Familie angefordert. Der alte Code gilt nicht mehr. Hier ist der neue (4 Ziffern):",
  "email.recover.after":
    "Im Admin-Modus kannst du ihn ändern. Wenn du das nicht angefordert hast, ändere den Code so schnell du kannst und schreib an <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a> (Beschwerden: kidsrewardsystem@proton.me).",
  "email.recover.afterText":
    "Im Admin-Modus kannst du ihn ändern. Wenn du das nicht angefordert hast, schreib an contact@kidsrewardsystem.com (Beschwerden: kidsrewardsystem@proton.me).",
  "email.reset.subject": "Dein Code zum Zurücksetzen des Passworts",
  "email.reset.title": "Passwort zurücksetzen",
  "email.reset.body":
    "Jemand hat gebeten, das Passwort dieses Kontos zu ändern. Hier ist der 6-stellige Code (15 Minuten gültig):",
  "email.reset.after":
    "Gib ihn in der App zusammen mit deinem neuen Passwort ein. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.",
  "email.reset.afterText":
    "Gib ihn in der App zusammen mit deinem neuen Passwort ein. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.",
  "email.daily.subject": "✅ Täglicher Bericht - {dayName} {date}",
  "email.daily.title": "Bericht",
  "email.daily.heading": "✅ Bericht — {dayName} {date}",
  "email.daily.reset": "Reset",
  "email.daily.deletion": "Löschung",
  "email.daily.globalScore": "Gesamtscore",
  "email.daily.member": "Mitglied",
  "email.daily.scoreDetails": "Score & Details",
  "email.daily.normal": "Normal",
  "email.daily.bonus": "Bonus",
  "email.daily.penalties": "Strafen",
  "email.daily.seriousFault": "Schwerer Fehler",
  "email.daily.yes": "JA",
  "email.daily.no": "nein",
  "email.daily.tasks": "Aufgaben",
  "email.daily.monthly": "Monatlich",
  "email.daily.monthlyReset": "monatlicher Reset durchgeführt (1. Tag des Monats).",
  "email.daily.oneOff": "Einmalig",
  "email.daily.oneOffDeleted": "{count} Aufgabe(n) gelöscht.",
  "email.daily.footer": "Bericht automatisch erstellt — Belohnungssystem",
  "email.daily.day.0": "Sonntag",
  "email.daily.day.1": "Montag",
  "email.daily.day.2": "Dienstag",
  "email.daily.day.3": "Mittwoch",
  "email.daily.day.4": "Donnerstag",
  "email.daily.day.5": "Freitag",
  "email.daily.day.6": "Samstag",
  "email.legalHtml":
    "<a href=\"{origin}/privacy.html\">Datenschutz</a> · <a href=\"{origin}/terms.html\">Bedingungen</a>",
  "email.legalText": "Datenschutz: {origin}/privacy.html\nBedingungen: {origin}/terms.html",
};

const en = {
  "err.unauthenticated": "Sign in to continue.",
  "err.emailInUse": "This email is already in use. Sign in.",
  "err.invalidEmail": "Invalid email.",
  "err.weakPassword": "Password too weak (6 characters min.).",
  "err.emailNotConfigured":
    "Email isn’t set up yet. Try again later, or write to contact@kidsrewardsystem.com.",
  "err.resendWait": "Wait a minute before sending the code again.",
  "err.mailFailed": "Couldn’t send the email. Try again in a moment.",
  "err.verifyMailFailed": "Couldn’t send the verification email. Try again in a moment.",
  "err.codeSixDigits": "The code must be 6 digits.",
  "err.codeExpired": "This code has expired. Request a new one.",
  "err.codeLocked": "Too many attempts. Request a new code.",
  "err.codeWrong": "Incorrect code.",
  "err.accountMissing": "Account not found. Start signup again.",
  "err.familyMissing": "Family not set up yet.",
  "err.ownerOnly": "Only the account holder can do that.",
  "err.pinFourDigits": "The Admin code must be 4 digits.",
  "err.pinExists": "An Admin code already exists. Use “Change Admin code”.",
  "err.pinChooseFirst": "Choose an Admin code first.",
  "err.pinLocked": "Too many attempts. Use “Recover Admin code” or try again later.",
  "err.pinWrong": "Incorrect code.",
  "err.pinCurrentWrong": "Current code is incorrect.",
  "err.noOwnerEmail": "No holder email to send the code to.",
  "err.recoverWait": "A recovery email was already sent. Try again in 15 minutes.",
  "err.subscriptionActive": "A subscription is already active.",
  "err.originHttps": "HTTPS origin required.",
  "err.sessionSandbox": "Sandbox sessionId (cs_test_…) required. Live sessions are refused.",
  "err.sessionLive": "Live sessionId (cs_live_…) required on kidsrewardsystem.",
  "err.liveEvent": "Live event refused (sandbox only).",
  "err.testEvent": "Test event refused (live only).",
  "err.sessionOtherFamily": "This Stripe session belongs to another family.",
  "err.noStripeCustomer": "No Stripe customer yet.",
  "err.originRequired": "origin required.",
  "err.subscriptionRequired": "Subscription required.",
  "err.childNames": "Enter between 1 and 6 first names.",
  "err.personRequired": "Person required.",
  "err.invalidName": "The first name must be 1 to 40 characters.",
  "err.personNotFound": "Person not found.",
  "err.internalFamily": "Couldn’t create the family.",
  "err.acceptedLegal": "Accept the Terms and Privacy policy to create an account.",
  "err.tosNotAccepted": "Accept the Terms and Privacy policy to create an account.",
  "err.createUserFailed": "Couldn’t create the account. Try again in a moment.",
  "err.referralOnce": "This family’s referral is already saved.",
  "err.referralName": "Enter a first and last name (no link or email), or skip this step.",
  "err.resetMailFailed": "Couldn’t send the reset email. Try again in a moment.",
  "email.fromName": "Rewards system",
  "email.signoff": "See you soon!",
  "email.dad": "A Belgian dad",
  "email.welcome.subject": "Welcome — your verification code",
  "email.welcome.title": "Welcome 👋",
  "email.welcome.body":
    "Hi, and welcome. I’m a Belgian dad: I built this app so families can follow the <b>kids’ tasks</b>, earn <b>stars</b>, and turn that into <b>screen time</b> — without a fight every evening.",
  "email.welcome.bodyText":
    "Hi, and welcome. I’m a Belgian dad: I built this app so families can follow the kids’ tasks, earn stars, and turn that into screen time.",
  "email.welcome.identityNote":
    "(my name will only be revealed to paying users after the trial, to avoid spam and identity theft)",
  "email.welcome.signoff": "Your turn to play! 😉",
  "email.welcome.codeIntro": "Here’s your verification code (valid for 15 minutes):",
  "email.welcome.codeExpiry": "This code expires after 15 minutes.",
  "email.welcome.afterCode":
    "Enter it in the app <b>before</b> you sign in. Until then, the account stays locked.",
  "email.welcome.afterCodeText": "Enter it in the app before you sign in.",
  "email.welcome.adminTitle": "Admin mode, in short",
  "email.welcome.admin1":
    "On <b>first access</b>, you choose a <b>4-digit</b> Admin code. Remember it: we don’t email it now.",
  "email.welcome.admin2": "In Admin mode, you can change it (“<b>Change Admin code</b>”).",
  "email.welcome.admin3":
    "If you’re not in Admin mode and you forgot the code, use “<b>Recover Admin code</b>”. We email a <b>new</b> 4-digit code, and the old one stops working.",
  "email.welcome.adminText":
    "Admin mode:\n- On first access, you choose a 4-digit Admin code. Remember it: we don’t email it now.\n- In Admin mode, you can change it (“Change Admin code”).\n- If you’re not in Admin mode and you forgot the code, use “Recover Admin code”. We email a new 4-digit code, and the old one stops working.",
  "email.welcome.pricesTitle": "Prices",
  "email.welcome.prices":
    "<b>€2.50/month</b> (that would be €30/year if you stay monthly) or <b>€25/year</b>. First month trial, with a card on file. I set the price around a beer (or a coffee) a month, because a Belgian father built it — not to buy a Ferrari, just to pay for the server (and originally to find a way to manage his own kids’ screen time, with emphasis on rewards and responsibilities).",
  "email.welcome.pricesText":
    "Prices: €2.50/month (€30/year if paid monthly) or €25/year. First month trial, with a card on file. Price around a beer (or a coffee) a month, because a Belgian father built it — not to buy a Ferrari, just to pay for the server (and originally to find a way to manage his own kids’ screen time, with emphasis on rewards and responsibilities).",
  "email.welcome.contact":
    "An idea, a complaint, a “it’s buggy”? Write to <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a>. Complaints may also go to kidsrewardsystem@proton.me.",
  "email.welcome.contactText":
    "Suggestions / complaints: contact@kidsrewardsystem.com (complaints also: kidsrewardsystem@proton.me)",
  "email.welcome.dailyEmail":
    "You’ll get a daily summary by email. You can turn it off on the home screen.",
  "email.welcome.dailyEmailText":
    "You’ll get a daily summary by email. You can turn it off on the home screen.",
  "email.recover.subject": "New Admin code",
  "email.recover.title": "New Admin code",
  "email.recover.body":
    "Someone asked to recover your family’s Admin code. The old code no longer works. Here’s the new one (4 digits):",
  "email.recover.after":
    "In Admin mode, you can change it. If you didn’t request this, change the code as soon as you can and write to <a href=\"mailto:contact@kidsrewardsystem.com\">contact@kidsrewardsystem.com</a> (complaints: kidsrewardsystem@proton.me).",
  "email.recover.afterText":
    "In Admin mode, you can change it. If you didn’t request this, write to contact@kidsrewardsystem.com (complaints: kidsrewardsystem@proton.me).",
  "email.reset.subject": "Your password reset code",
  "email.reset.title": "Reset your password",
  "email.reset.body":
    "Someone asked to change the password for this account. Here’s the 6-digit code (valid for 15 minutes):",
  "email.reset.after":
    "Enter it in the app with your new password. If you didn’t request this, ignore this email.",
  "email.reset.afterText":
    "Enter it in the app with your new password. If you didn’t request this, ignore this email.",
  "email.daily.subject": "✅ Daily Report - {dayName} {date}",
  "email.daily.title": "Report",
  "email.daily.heading": "✅ Report — {dayName} {date}",
  "email.daily.reset": "Reset",
  "email.daily.deletion": "Deletion",
  "email.daily.globalScore": "Overall score",
  "email.daily.member": "Member",
  "email.daily.scoreDetails": "Score & details",
  "email.daily.normal": "Normal",
  "email.daily.bonus": "Bonus",
  "email.daily.penalties": "Penalties",
  "email.daily.seriousFault": "Serious fault",
  "email.daily.yes": "YES",
  "email.daily.no": "no",
  "email.daily.tasks": "tasks",
  "email.daily.monthly": "Monthly",
  "email.daily.monthlyReset": "monthly reset done (1st day of the month).",
  "email.daily.oneOff": "One-off",
  "email.daily.oneOffDeleted": "{count} task(s) deleted.",
  "email.daily.footer": "Report generated automatically — Rewards system",
  "email.daily.day.0": "Sunday",
  "email.daily.day.1": "Monday",
  "email.daily.day.2": "Tuesday",
  "email.daily.day.3": "Wednesday",
  "email.daily.day.4": "Thursday",
  "email.daily.day.5": "Friday",
  "email.daily.day.6": "Saturday",
  "email.legalHtml":
    "<a href=\"{origin}/privacy.html\">Privacy</a> · <a href=\"{origin}/terms.html\">Terms</a>",
  "email.legalText": "Privacy: {origin}/privacy.html\nTerms: {origin}/terms.html",
};

function assertSameKeys() {
  const keys = Object.keys(nl).sort();
  for (const [name, dict] of [
    ["fr", fr],
    ["de", de],
    ["en", en],
  ]) {
    const other = Object.keys(dict).sort();
    if (keys.join("\n") !== other.join("\n")) {
      throw new Error(`locale ${name} keys do not match nl`);
    }
  }
}

assertSameKeys();

module.exports = { DEFAULT_LOCALE, LOCALES: { nl, fr, de, en } };
