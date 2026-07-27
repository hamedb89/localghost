export default {
  project: "localghost-multi-service-example",
  services: [
    {
      name: "web",
      cwd: "apps/web",
      host: "multi.localhost",
      port: 4173
    },
    {
      name: "api",
      cwd: "apps/api",
      host: "api.multi.localhost",
      port: 8787
    }
  ]
};
