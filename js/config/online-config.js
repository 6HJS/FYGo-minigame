export const ONLINE_CONFIG = {
  // 仅通过微信云托管 callContainer 访问内网服务，不直接请求内网域名
  httpBaseUrl: '',
  wsUrl: '',

  useCloudContainerForHttp: true,
  cloudEnv: 'prod-1g9u7qzrc03dfa1f',
  cloudService: 'fygo-prod',
  cloudInternalDomain: 'arkyenhy.fygo-prod.5vbojtns.ns77jehd.com',

  requestTimeoutMs: 8000,
  pollIntervalMs: 1000,
  forceTakeover: true
};

export default ONLINE_CONFIG;
