export interface FixtureDescriptor {
  readonly name: string;
}

export function createFixtureDescriptor(name: string): FixtureDescriptor {
  return { name };
}
