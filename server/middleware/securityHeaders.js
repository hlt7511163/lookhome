// 网关/应用层安全响应头（等保测评常见检查项）
// HSTS 仅在 HTTPS 下有意义；若域名已全站 HTTPS 则保持默认开启
export function securityHeaders() {
  const enableCsp = process.env.LOOKHOME_CSP_REPORT_ONLY === '1';
  return function (req, res, next) {
    res.removeHeader('X-Powered-By');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (enableCsp) {
      res.setHeader(
        'Content-Security-Policy-Report-Only',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'"
      );
    }
    next();
  };
}
