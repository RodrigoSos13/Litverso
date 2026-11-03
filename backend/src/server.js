import { prepareEmailStorage } from "./auth/migrateEmails.js";
import dotenv from "dotenv";
import { EmailCode, AuthLimit } from "./auth/emailCodes.js";
import { Report } from "./models/Report.js";
import { User } from "./models/User.js";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";

import { prepareCatalog } from "./services/catalogSync.js";

dotenv.config();

const port = process.env.PORT || 5000;

connectDatabase()
  .then(async () => {
    const migrated = await prepareEmailStorage();
    console.log(`E-mails protegidos: ${migrated.users} contas, ${migrated.pending} cadastros pendentes.`);
    await Promise.all([EmailCode.init(), AuthLimit.init(), User.init(), Report.init()]);
    await prepareCatalog();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(() => {
    console.error("Inicialização interrompida. Verifique banco e chaves EMAIL_ENCRYPTION_KEY/EMAIL_LOOKUP_KEY; chaves existentes não devem ser substituídas.");
    process.exit(1);
  });
