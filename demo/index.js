import express from 'express';
import AdminForth from '../adminforth/index.js';

const ADMIN_BASE_URL = '/bo';

const admin = new AdminForth({
  // baseUrl : ADMIN_BASE_URL,
  datasources: [
    {
      id: 'sqlite',
      url: 'sqlite://test1.db',
    }
  ],
  resources: [
    {
      label: 'User',
      menugroup: 'system',
      datasource: 'sqlite'
    }
  ],
  menugroups: [
    {
      id: 'system',
      label: 'System',
    },
  ],
})


const app = express()
const port = 3000;

(async () => {

    // needed to compile SPA. Call it here or from a build script e.g. in Docker build time to reduce downtime
    await admin.bundleNow({ hotReload: process.env.NODE_ENV === 'development' });
    console.log('Bundling AdminForth done. For faster serving consider calling bundleNow() from a build script.');

})();




admin.express.serve(app, express)

app.get(
  '/api/custom_data', 
  admin.express.authorize(
    (req, res) => {

      res.json({
        number: 124,
      })
    }
  )
)

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
  console.log(`AdminForth is available at http://localhost:${port}${ADMIN_BASE_URL}`)
});