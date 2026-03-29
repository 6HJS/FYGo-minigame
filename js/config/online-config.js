export const ONLINE_CONFIG = {
  // 云托管正式服务
  httpBaseUrl: 'https://fygo-prod-240108-10-1413448174.sh.run.tcloudbase.com',
  wsUrl: 'wss://fygo-prod-240108-10-1413448174.sh.run.tcloudbase.com/ws',

  // 云开发 callContainer 配置（HTTP 请求优先走它，避免反复配白名单）
  useCloudContainerForHttp: true,
  cloudEnv: 'prod-1g9u7qzrc03dfa1f',
  cloudService: 'fygo-prod',

  requestTimeoutMs: 8000,
  heartbeatMs: 15000,
  forceTakeover: true
};

export default ONLINE_CONFIG;
