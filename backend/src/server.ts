import 'dotenv/config';
import { createApp } from './app';
import { createBackgroundJobs } from './composition/createBackgroundJobs';
import { createDependencies } from './composition/createDependencies';



const DEFAULT_PORT = 4000;
const port = Number(process.env.PORT ?? DEFAULT_PORT);



const dependencies = createDependencies(process.env);

createApp(dependencies).listen(port, () => {
  console.log(`T-Pay backend listening on port ${port}`);
  createBackgroundJobs(dependencies).start();
});