# Embeddings

The Embeddings API converts text into numerical vector representations. These vectors capture semantic meaning and can be used for semantic search, clustering, classification, recommendation systems, and RAG (Retrieval-Augmented Generation) pipelines.

Access via `client.embeddings`.

---

## Basic Usage

```ts
import Skytells from 'skytells';

const client = Skytells(process.env.SKYTELLS_API_KEY);

const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'The quick brown fox jumps over the lazy dog',
});

const vector = result.data[0].embedding; // number[]
console.log(`Model: ${result.model}`);
console.log(`Dimensions: ${vector.length}`);
console.log(`Tokens used: ${result.usage.total_tokens}`);
```

---

## Batch Embeddings

Pass an array of strings to embed multiple texts in a single request:

```ts
const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: [
    'TypeScript is a strongly typed language',
    'JavaScript is dynamically typed',
    'Python has optional type hints',
  ],
});

// result.data is indexed in the same order as input
for (const embedding of result.data) {
  console.log(`Index ${embedding.index}: ${embedding.embedding.length} dimensions`);
}
```

---

## Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | `string` | ✅ | Embedding model slug (e.g. `"text-embedding-3-small"`) |
| `input` | `string \| string[]` | ✅ | Text or array of texts to embed |
| `encoding_format` | `'float' \| 'base64'` | ❌ | Return format. `'float'` (default) returns `number[]`; `'base64'` returns base64-encoded float32 array |
| `dimensions` | `number` | ❌ | Reduce output dimensions (if the model supports it) |
| `user` | `string` | ❌ | End-user identifier for monitoring |

---

## Response Shape

```ts
interface CreateEmbeddingResponse {
  object: 'list';
  data: Embedding[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface Embedding {
  object: 'embedding';
  index: number;                        // position in input array
  embedding: number[] | Float32Array;   // the vector
}
```

---

## Semantic Similarity

Use cosine similarity to measure how semantically related two texts are:

```ts
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i]!, 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: ['I love programming', 'Coding is my passion'],
});

const [v1, v2] = result.data.map(d => d.embedding as number[]);
console.log(cosineSimilarity(v1, v2)); // close to 1.0 — very similar
```

---

## Semantic Search

Embed a query and compare against a set of documents:

```ts
const documents = [
  'The Eiffel Tower is in Paris',
  'Mount Fuji is in Japan',
  'The Amazon River flows through Brazil',
  'Big Ben is in London',
];

// Embed all documents
const docResult = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: documents,
});
const docVectors = docResult.data.map(d => d.embedding as number[]);

// Embed the query
const queryResult = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Where is the leaning tower?',
});
const queryVector = queryResult.data[0].embedding as number[];

// Rank by similarity
const ranked = documents
  .map((doc, i) => ({ doc, similarity: cosineSimilarity(queryVector, docVectors[i]!) }))
  .sort((a, b) => b.similarity - a.similarity);

console.log('Most relevant:', ranked[0].doc);
```

---

## Use Cases

### RAG (Retrieval-Augmented Generation)

```ts
// 1. Embed your knowledge base at index time
const knowledge = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: knowledgeChunks, // string[]
});
// Store knowledge.data[i].embedding in a vector database

// 2. At query time, embed the user question
const queryEmbedding = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: userQuestion,
});

// 3. Retrieve top-K nearest chunks from vector DB
// 4. Pass retrieved chunks as context to Chat or Responses API
const answer = await client.chat.completions.create({
  model: 'deepbrain-router',
  messages: [
    { role: 'system', content: `Answer based on context: ${retrievedChunks.join('\n')}` },
    { role: 'user', content: userQuestion },
  ],
});
```

### Text Clustering

```ts
// Embed a corpus of texts
const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: corpus,
});

// Use a clustering algorithm (e.g. k-means) on result.data.map(d => d.embedding)
```

### Duplicate Detection

```ts
const SIMILARITY_THRESHOLD = 0.95;

const result = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: texts,
});

const vectors = result.data.map(d => d.embedding as number[]);

const duplicates: [number, number][] = [];
for (let i = 0; i < vectors.length; i++) {
  for (let j = i + 1; j < vectors.length; j++) {
    if (cosineSimilarity(vectors[i]!, vectors[j]!) > SIMILARITY_THRESHOLD) {
      duplicates.push([i, j]);
    }
  }
}
```

---

## Error Handling

```ts
import { SkytellsError } from 'skytells';

try {
  const result = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: userText,
  });
} catch (e) {
  if (e instanceof SkytellsError) {
    if (e.errorId === 'RATE_LIMIT_EXCEEDED') {
      // Retry after delay
    } else if (e.errorId === 'INVALID_INPUT') {
      // Input too long or empty
    }
    console.error(e.errorId, e.message);
  }
}
```

---

## Best Practices

- **Batch requests**: Pass an array to `input` rather than making separate calls — it's more efficient and consumes fewer tokens.
- **Cache vectors**: Embedding the same text produces the same vector. Cache results in a database to avoid recomputing.
- **Right-size dimensions**: Use `dimensions` to reduce vector size if your model supports it — smaller vectors are cheaper to store and faster to compare.
- **Normalise before comparing**: Some vector stores expect unit-length vectors. Divide each component by the vector's L2 norm.
- **Mind token limits**: Very long texts may exceed the model's context window. Chunk documents before embedding.
