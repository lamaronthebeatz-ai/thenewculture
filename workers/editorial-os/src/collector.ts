/**
 * CollectorPipeline — 1:1 port of editorial-intelligence/collector/pipeline.py.
 * Every dependency is constructor-injected, same as the Python original.
 */
import { ConfidenceEngine, DuplicateEngine, EditorialMappingEngine } from "./events";
import { EditorialEvent } from "./models";
import { EventProvider } from "./providers";
import { ProviderRegistry } from "./providers";
import { EventQueue } from "./queue";

export interface CollectorPipelineOptions {
  confidenceEngine?: ConfidenceEngine;
  duplicateEngine?: DuplicateEngine;
  mappingEngine?: EditorialMappingEngine;
}

export class CollectorPipeline {
  private registry: ProviderRegistry;
  private queue: EventQueue;
  private confidence: ConfidenceEngine;
  private duplicate: DuplicateEngine;
  private mapping: EditorialMappingEngine;

  constructor(registry: ProviderRegistry, eventQueue: EventQueue, options: CollectorPipelineOptions = {}) {
    this.registry = registry;
    this.queue = eventQueue;
    this.confidence = options.confidenceEngine ?? new ConfidenceEngine();
    this.duplicate = options.duplicateEngine ?? new DuplicateEngine();
    this.mapping = options.mappingEngine ?? new EditorialMappingEngine();
  }

  /** Runs collect() on every registered Provider, then for each resulting
   * Event: Duplicate Engine -> Confidence Engine -> Editorial Mapping ->
   * push into the EventQueue. Returns only newly-added events (not those
   * absorbed into an existing one via merge). */
  async run(): Promise<EditorialEvent[]> {
    const newlyAdded: EditorialEvent[] = [];
    for (const provider of this.registry.all()) {
      for (const event of await (provider as EventProvider).collect()) {
        const [kept, wasMerged] = this.duplicate.process(event, this.queue.all());
        this.confidence.apply(kept);
        this.mapping.applyFull(kept);
        this.queue.push(kept);
        if (!wasMerged) newlyAdded.push(kept);
      }
    }
    return newlyAdded;
  }
}
