# Changelog

## 0.1.0 (2026-06-19)

### Features

* **core:** JWE seal/open for stateless OAuth tokens ([3d235f4](https://github.com/aimuzov/kaiten-mcp/commit/3d235f47ca0337e5ee5db4ef82be36b58c851d4e))
* **core:** PKCE S256 verification ([b8dcb04](https://github.com/aimuzov/kaiten-mcp/commit/b8dcb04c9e105d9362e1d1a1feaf7696e70ab213))
* **web:** authorize endpoint with Kaiten token consent form ([86f5efa](https://github.com/aimuzov/kaiten-mcp/commit/86f5efa235b2f5de67b39507b089403ef5942d0c))
* **web:** dynamic client registration endpoint ([15b4134](https://github.com/aimuzov/kaiten-mcp/commit/15b41348f1fb973d8786e6512ad705d9e32c85b6))
* **web:** MCP endpoint via mcp-handler with Bearer (JWE) auth ([2c69183](https://github.com/aimuzov/kaiten-mcp/commit/2c691835f83fb49de38a0e0a17d9dc555f7b51e1))
* **web:** OAuth discovery metadata endpoints ([7241332](https://github.com/aimuzov/kaiten-mcp/commit/724133297563b0d55e550387e62359e2f70b643c))
* **web:** scaffold Next.js app for Vercel ([7f0a66d](https://github.com/aimuzov/kaiten-mcp/commit/7f0a66d160a0d227f0cc28dbef41ac5b6b5318f8))
* **web:** token endpoint (authorization_code + refresh_token) ([6f8c2e3](https://github.com/aimuzov/kaiten-mcp/commit/6f8c2e3e9ab009b0b9295ae5e895fd13dedf02d6))

### Bug Fixes

* **web:** build @kaiten-mcp/core before web build on Vercel ([f6024f1](https://github.com/aimuzov/kaiten-mcp/commit/f6024f16b7808ee8f646960bc319f4d78958f876))
* **web:** correct Vercel outputDirectory to .next ([8e9b5ba](https://github.com/aimuzov/kaiten-mcp/commit/8e9b5ba291d2236156b84ea71d92f155393b1568))
* **web:** normalize user-entered Kaiten URL before building client ([9bad1c6](https://github.com/aimuzov/kaiten-mcp/commit/9bad1c6251102771202dfe75485be06d14c6ddbc))
* **web:** security & robustness from final review ([9316417](https://github.com/aimuzov/kaiten-mcp/commit/931641776a924f2ff26e3682b9b64cbbccac6332))
