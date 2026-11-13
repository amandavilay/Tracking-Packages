// Run a scheduled job locally: npm run job -- scan | tracking | prices | returns | digest
import { JOBS } from "../lib/jobs";
const name = process.argv[2];
if (!JOBS[name]) { console.log("Jobs:", Object.keys(JOBS).join(", ")); process.exit(1); }
JOBS[name]().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); });
