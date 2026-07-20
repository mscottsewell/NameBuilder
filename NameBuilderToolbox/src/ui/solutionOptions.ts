/**
 * Shared <option> rendering for every solution dropdown: the user's preferred
 * solution first (ungrouped), then an 'Unmanaged' group and a 'Managed' group,
 * each alphabetical (listSolutions already sorts by friendly name).
 *
 * The Plugin Solution pickers pass includeManaged: false — plugin steps can't
 * be added to managed solutions, and a managed preferred solution is skipped
 * there for the same reason.
 */

import { el } from './dom';
import type { SolutionInfo } from '../dataverse';

export function appendSolutionOptions(
  select: HTMLSelectElement,
  solutions: SolutionInfo[],
  preferredSolutionId: string | null,
  optionValue: (solution: SolutionInfo) => string,
  opts: { includeManaged?: boolean } = {}
): void {
  const includeManaged = opts.includeManaged ?? true;
  const option = (s: SolutionInfo) => el('option', { value: optionValue(s) }, s.friendlyName);

  const preferred = preferredSolutionId
    ? solutions.find((s) => s.id.toLowerCase() === preferredSolutionId.toLowerCase())
    : undefined;
  if (preferred && (includeManaged || !preferred.isManaged)) {
    select.append(option(preferred));
  }

  const rest = solutions.filter((s) => s !== preferred);
  const appendGroup = (groupLabel: string, items: SolutionInfo[]) => {
    if (items.length === 0) return;
    const group = el('optgroup', { label: groupLabel });
    items.forEach((s) => group.append(option(s)));
    select.append(group);
  };
  appendGroup('Unmanaged', rest.filter((s) => !s.isManaged));
  if (includeManaged) appendGroup('Managed', rest.filter((s) => s.isManaged));
}
