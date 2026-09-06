import { useState } from 'react';
import { useUserData } from '../auth/UserDataContext';
import type { Program } from '../types';
import DirectoryCardView from './DirectoryCardView';

export default function DirectoryCard({ program }: { program: Program }) {
  const { isResourceSaved, toggleResource } = useUserData();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPending, setSavingPending] = useState(false);

  async function handleSave() {
    setSaveError(null);
    setSavingPending(true);
    try {
      await toggleResource(program.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this resource.');
    } finally {
      setSavingPending(false);
    }
  }

  return <DirectoryCardView program={program} saved={isResourceSaved(program.id)}
    savingPending={savingPending} saveError={saveError} onSave={handleSave} />;
}
