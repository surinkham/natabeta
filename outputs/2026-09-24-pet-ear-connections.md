# Dog and rodent ear connections

Adjusted existing GLB ear roots for golden, shiba, husky, chihuahua, hamster, dumbo, white mouse, and legacy mouse/dog/shiba assets. Preserved original textures, equipment, mesh names, and skeleton.

Upright ear bases extend down and inward; hanging dog ears tuck inward at the top; Dumbo roots extend toward the sides of the skull. Roots use head weights, with a smooth transition to movable ear tips. Fixed original closed-default/malformed open eyelid shapes and their material.

Reproduce: work/blender/.venv/bin/python work/blender/connect_pet_ears.py work/blender/out_connected_pets
Immutable original GLBs are saved under out_connected_pets/originals so repeated runs do not compound the deformation.

Each model is checked with a 25-degree ear rotation: anchored root vertices stay fixed.
