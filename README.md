# Creole Platform SDK for JavaScript/TypeScript

Official JavaScript/TypeScript SDK for the Creole Translation Platform.

## Installation

```bash
npm install @creole-platform/sdk-js
```

## Usage

```typescript
import { CreolePlatform } from '@creole-platform/sdk-js';

const platform = new CreolePlatform({
  translationUrl: 'http://localhost:8001',
  sttUrl: 'http://localhost:8002',
  ttsUrl: 'http://localhost:8003'
});

// Translate text
const result = await platform.translate({
  text: 'Hello world',
  from: 'en',
  to: 'ht'
});
```

## License
MIT
