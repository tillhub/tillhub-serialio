## [2.1.2](https://github.com/tillhub/tillhub-serialio/compare/v2.1.1...v2.1.2) (2018-12-12)


### Bug Fixes

* **DataParser:** fixed data not being dropped if no message was found ([e505ec5](https://github.com/tillhub/tillhub-serialio/commit/e505ec5))

## [2.1.1](https://github.com/tillhub/tillhub-serialio/compare/v2.1.0...v2.1.1) (2018-12-12)


### Bug Fixes

* **Utils:** fixed truncate result length being off by 1 if mL is odd ([3692037](https://github.com/tillhub/tillhub-serialio/commit/3692037))
* fixed data parsing ([2f1d42a](https://github.com/tillhub/tillhub-serialio/commit/2f1d42a))

# [2.1.0](https://github.com/tillhub/tillhub-serialio/compare/v2.0.0...v2.1.0) (2018-12-06)


### Features

* added ability to set various event handlers ([6c44a38](https://github.com/tillhub/tillhub-serialio/commit/6c44a38))

# [2.0.0](https://github.com/tillhub/tillhub-serialio/compare/v1.0.0...v2.0.0) (2018-12-04)


### Features

* changed 4-byte start sequence to make message detection more robust ([9761387](https://github.com/tillhub/tillhub-serialio/commit/9761387))


### BREAKING CHANGES

* Due to this low-level change, prior versions will be unable to detect new messages sent with this version, and vice-versa.

# 1.0.0 (2018-11-16)


### Bug Fixes

* **build:** fixes file inclusion for npm ([50d314c](https://github.com/tillhub/tillhub-serialio/commit/50d314c))
* **build:** fixes path to ci config ([ac1030f](https://github.com/tillhub/tillhub-serialio/commit/ac1030f))
* fixed 2 eslint errors ([2a3cc21](https://github.com/tillhub/tillhub-serialio/commit/2a3cc21))
* fixed data type internal variable declaration ([f7c149e](https://github.com/tillhub/tillhub-serialio/commit/f7c149e))
* fixed error when trying to send simple string ([7ebe13a](https://github.com/tillhub/tillhub-serialio/commit/7ebe13a))
* improved error handling and propagation ([a79bb22](https://github.com/tillhub/tillhub-serialio/commit/a79bb22))
* improved message sending behaviour + improved logging ([e8e2a13](https://github.com/tillhub/tillhub-serialio/commit/e8e2a13))
* improved messageHandler handling ([80117d3](https://github.com/tillhub/tillhub-serialio/commit/80117d3))
* **Message:** fixed var raw message values binding to wrong internal variable ([26599cf](https://github.com/tillhub/tillhub-serialio/commit/26599cf))
* **Message:** modified Message types ([cf350b7](https://github.com/tillhub/tillhub-serialio/commit/cf350b7))


### Features

* added abstract base class for message data ([252622a](https://github.com/tillhub/tillhub-serialio/commit/252622a))
* added attempting to reopen serial port after unexpected close event ([0b5d236](https://github.com/tillhub/tillhub-serialio/commit/0b5d236))
* added tests ([a976a9b](https://github.com/tillhub/tillhub-serialio/commit/a976a9b))
* added/standardized data types ([3913c81](https://github.com/tillhub/tillhub-serialio/commit/3913c81))
* disabled auto opening; added open(), close() and isOpen() functions ([60522a3](https://github.com/tillhub/tillhub-serialio/commit/60522a3))
* enables auto build ([f4a7204](https://github.com/tillhub/tillhub-serialio/commit/f4a7204))
* simplified SerialIO ([377aec4](https://github.com/tillhub/tillhub-serialio/commit/377aec4))
