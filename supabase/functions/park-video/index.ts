import { Input, BufferSource, MP4, EncodedPacketSink } from 'npm:mediabunny@1.66.2';
import { createHandler } from './handler.mjs';
import { createVideoValidator } from './validation.mjs';

Deno.serve(createHandler({ env: (key: string) => Deno.env.get(key),
  validate: createVideoValidator({ Input, BufferSource, MP4, EncodedPacketSink }) }));
