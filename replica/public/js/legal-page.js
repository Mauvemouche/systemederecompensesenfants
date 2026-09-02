import { bootI18n, onLocaleChange } from "./i18n.js";
import { fillPublicContact } from "./legal-identity.js";

await bootI18n();
fillPublicContact();
onLocaleChange(() => fillPublicContact());
