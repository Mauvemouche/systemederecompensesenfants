import { bootI18n, onLocaleChange } from "./i18n.js";
import { fillLegalIdentity } from "./legal-identity.js";

await bootI18n();
fillLegalIdentity();
onLocaleChange(() => fillLegalIdentity());
