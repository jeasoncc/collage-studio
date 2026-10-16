import type { PosterDesign } from './posterDesign';
import { editorialPosterDesigns } from './editorialPosters';
import { lifestylePosterDesigns } from './lifestylePosters';

// Alternate editorial and everyday designs in the home and editor galleries.
const designs: PosterDesign[] = [];
for (let index = 0; index < Math.max(editorialPosterDesigns.length, lifestylePosterDesigns.length); index++) {
  const editorial = editorialPosterDesigns[index];
  const lifestyle = lifestylePosterDesigns[index];
  if (editorial) designs.push(editorial);
  if (lifestyle) designs.push(lifestyle);
}
export const designerPosterDesigns: readonly PosterDesign[] = designs;
