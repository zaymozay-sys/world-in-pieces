# Промты: объёмные фигурки существ для карты (62 штуки)

Зачем: на карте существа сейчас — круглые портреты с кольцом цвета. Фигурки (как у героев и стражей) смотрятся объёмнее и живее. Когда картинки лягут в `art/map/mob-<id>.png`, подключим: фигурка встанет вместо портрета, цвет уровня останется в кольце и свечении под подставкой.

## Нужно ли прикладывать картинки

Да. ChatGPT не откроет папку Google Диска по ссылке (даже если ссылка открыта, он не видит содержимое папки, а картинки из Диска не разберёт). Поэтому к каждому сообщению прикладывайте файлы с компьютера:

1. портреты существ этой партии — те же `art/monsters/<id>.webp` (или оригиналы из `Мой диск\Game\!_art\`; webp ChatGPT принимает, но если не примет — конвертируйте в png);
2. одну готовую фигурку как эталон стиля — например `art/map/hero-dwarf-m.webp` (или `boss-b1`). Первую партию делайте с героем, следующие — с уже получившейся фигуркой существа.

Партии по 5 штук: больше — стиль «плывёт». Каждое существо — отдельная картинка, не лист. Если прозрачность не получилась — на странице арт-промтов есть запасные фразы («Фон не прозрачный…»).

Готовые файлы называйте `mob-<id>.png` и кладите в `Мой диск\Game\!_art\map\` — подключу с проверкой.

## Правила партии (в конце каждого сообщения)

Rules for every image above (the figurine must clearly be the same creature as the attached portrait of it: same species, same colors, same markings and gear; the finished hero figurine I attach shows the style, the base and the lighting): Square image, 1024x1024. A 3D-looking collectible miniature figurine, as if a render of a hand-painted resin or clay tabletop miniature: soft rounded forms, light sculpted texture, visible brush marks on the paint, slightly glossy paint on metal and gems. Three-quarter view from slightly above (camera about 30 degrees above), the figure stands on a small round dark-gray stone base with a little moss (base diameter about a quarter of the frame width, no inscriptions). Soft warm light from the upper left, cool bounce light on the right in the shadows, a short soft shadow under the base. ONE figure, centered, fully inside the frame with a margin of about 6%. It is shown as small as 96 pixels on a map, so the silhouette must be big and clear, with 3-4 main colors and no tiny details. No level rings, no colored auras, no crown icon floating above, no text, no numbers, no frame, no watermark. Transparent background: export as a PNG with a real alpha channel, only the figurine is visible. Do not draw a checkerboard, a floor or a backdrop.

## Партия 1 из 13

1. **mob-rat** — Крыса-падальщик (портрет `rat.webp`): A scrawny scavenger rat crouching on the base, ragged ears, a notched tail curled around it, sharp yellow teeth, one paw holding a gnawed bone. Dirty brown-gray fur, pink tail and paws, a dull yellow glint in the eyes.
2. **mob-wolf** — Волк (портрет `wolf.webp`): A lean gray wolf in a low stalking pose, head turned to the viewer, ears back, bared fangs and a snarl, thick ruff at the neck. Smoke gray, cream belly, amber eyes.
3. **mob-bandit** — Разбойник (портрет `bandit.webp`): A sneering human bandit in a patched brown leather jerkin and a dark hood, a dagger in the right hand, a small round wooden shield on the left arm, a red neckerchief. Brown, olive, rusty steel, a red accent.
4. **mob-goblin** — Гоблин (портрет `goblin.webp`): A small hunched green goblin with huge pointed ears and a long nose, a crooked grin, ragged vest and belt with trinkets, a gnarled magic stick with a faint green spark in his hand. Olive green skin, brown rags, a bright green spark.
5. **mob-skeleton** — Скелет-воин (портрет `skeleton.webp`): A skeleton warrior in rusty plate scraps, a notched sword and a dented round shield, empty eye sockets with a faint cold glow, a cracked helmet. Bone ivory, rust orange, steel gray, a pale blue glimmer.

## Партия 2 из 13

6. **mob-boar** — Кабан-секач (портрет `boar.webp`): A heavy black-brown wild boar charging with its head lowered, two curved tusks, thick bristly mane along the back, mud on the legs. Dark brown, yellowed bone tusks, a red-brown eye.
7. **mob-troll** — Тролль (портрет `troll.webp`): A huge hulking troll with long arms, mossy gray-green skin with warty bumps, a small head with a heavy jaw and two lower tusks, a club of a knotted log, fresh scars closing on its shoulder. Gray-green, moss, brown wood.
8. **mob-golem** — Каменный голем (портрет `golem.webp`): A stocky golem built from gray boulders, glowing orange runes carved on the chest and fists, moss in the cracks, a block-like head with two dim amber eyes. Gray stone, green moss, warm orange runes.
9. **mob-wraith** — Призрак (портрет `wraith.webp`): A tall half-transparent hooded specter in a tattered robe, no legs, the body fading into pale mist above the base, hollow glowing eyes, two long thin hands. Pale blue and white, ash gray, soft glow.
10. **mob-dragon** — Дракон (портрет `dragon.webp`): A mature mountain dragon sitting on the base in battered plates of scale armor, a notched sword gripped in one claw, wings half folded, a cautious steady gaze. Dark red scales, bronze armor, gold eyes. It fills about 85% of the frame.

## Партия 3 из 13

11. **mob-orc** — Орк-рубака (портрет `orc.webp`): A broad green-skinned orc warrior in a leather harness with spiked pauldrons, a heavy cleaver in both hands, tusks, a braided topknot, war paint stripes. Olive green, brown leather, steel, red paint.
12. **mob-orcShaman** — Орк-шаман (портрет `orcShaman.webp`): A hunched green orc shaman with a horned hide on the shoulders, a drum made of skulls hanging on the chest, a bone drumstick raised, smoldering red sparks around the drum. Olive green, brown hide, bone white, ember red.
13. **mob-ghoul** — Упырь (портрет `ghoul.webp`): A pale gaunt ghoul on all fours, long clawed fingers, stretched gray skin over the ribs, a wide hungry mouth with thin teeth, sunken yellow eyes, wet swamp rags. Gray-green, sickly white, a yellow glint.
14. **mob-crab** — Болотный рак (портрет `crab.webp`): A large swamp crayfish with a mud-green armored shell and two raised claws, slime-green algae on the back, black bead eyes on stalks, half in murky green water on the base. Green-brown, orange claw tips.
15. **mob-bolotnik** — Болотник (портрет `bolotnik.webp`): A swamp lord made of peat and reeds: a bulky humanoid with a mossy tangled body, hanging green weeds like hair, glowing pale green eyes, a staff of a twisted branch with a lantern of marsh gas. Dark green, brown, a pale green glow.

## Партия 4 из 13

16. **mob-shadow** — Тень (портрет `shadow.webp`): A faceless wisp of living darkness in a rough humanoid shape, trailing tatters of black smoke, two thin glowing white-violet slits for eyes, long dark fingers reaching forward. Black, deep violet, a cold white glint.
17. **mob-treant** — Древень (портрет `treant.webp`): An old forest guardian: a walking tree with a bark-covered body, resin dripping amber from cracks, branch arms with leaf tufts, a face of knots with two dim amber eyes, roots spread across the base. Brown bark, green leaves, amber resin.
18. **mob-mushroom** — Дикий гриб (портрет `mushroom.webp`): A bloated fat mushroom creature with a wide spotted cap covered in gray-green mold, tiny angry eyes under the cap, short stubby legs, a puff of yellow spores rising from the top. Brown, ochre, moldy green, yellow spores.
19. **mob-lynx** — Рысь (портрет `lynx.webp`): A spotted forest lynx in a crouched ready pose, tufted ears, a short tail, big pale eyes, thick cheek ruffs. Tawny gold with dark spots, cream chest, pale green eyes.
20. **mob-hedgehog** — Шипастый ёж (портрет `hedgehog.webp`): A round spiky hedgehog half curled into a ball, a dense crown of long sharp quills, a small angry snout and black nose peeking out, tiny clawed paws. Brown and cream quills, a pink nose.

## Партия 5 из 13

21. **mob-wildbees** — Дикие пчёлы (портрет `wildbees.webp`): A hollow stump hive on the base with a swarm of five big striped bees buzzing around it, golden honey dripping from the entrance, one larger angry bee in front. Yellow and black stripes, brown wood, amber honey.
22. **mob-viper** — Гадюка (портрет `viper.webp`): A coiled viper with a raised head, the flattened triangular head with a zigzag pattern, tongue flicking, one drop of venom on a fang, sitting on a flat warm stone. Olive green, brown zigzag, yellow eyes.
23. **mob-spider** — Лесной паук (портрет `spider.webp`): A hairy forest spider with eight jointed legs, an orange hourglass-like mark on the dark abdomen, a bundle of web strands over a small branch on the base, glossy black eyes. Brown-black, orange mark, silver web.
24. **mob-vulture** — Стервятник (портрет `vulture.webp`): A big bald vulture with wings half-spread, a bare pink-gray neck with a ruff of feathers, a hooked beak, hunched threatening posture, perched on a dry branch stump. Dark brown feathers, pale neck, a yellow beak.
25. **mob-wisp** — Болотный огонёк (портрет `wisp.webp`): A small floating marsh will-o'-wisp: a bright teal-white flame with a faint mischievous face, a thin tail of light, little ripples of swamp water below it on the base. Teal and white glow, dark green water.

## Партия 6 из 13

26. **mob-gull** — Чайка-воришка (портрет `gull.webp`): A cheeky white-gray seagull with spread wings, a yellow hooked beak holding a shiny stolen gem, a sly eye, one webbed foot on a coiled rope on the base. White, gray, yellow, a ruby red gem.
27. **mob-hermit** — Краб-отшельник (портрет `hermit.webp`): A hermit crab in a big spiral seashell with barnacles, two orange claws raised, eye stalks up, a bit of fishing net draped on the shell, wet sand on the base. Orange, cream shell, sea blue accents.
28. **mob-smuggler** — Контрабандист (портрет `smuggler.webp`): A shady coastal smuggler in a long dark coat and a wide hat, a lantern in one hand, a heavy sack of loot on the shoulder, a knife at the belt, a cunning half smile. Dark blue-gray coat, warm lantern yellow, brown sack.
29. **mob-captain** — Капитан (портрет `captain.webp`): A scarred grizzled brigand captain in a faded blue officer coat with torn gold braid, a tricorn hat, a cutlass drawn, an eye patch, one boot on a small anchor. Navy blue, tarnished gold, steel, ginger beard.
30. **mob-pike** — Щука-глубинница (портрет `pike.webp`): A huge old pike leaping out of a splash of dark water on the base, a long toothy jaw open, mottled green-gold scales with pale spots, fins like thorns, one cloudy eye. Dark green, gold, pale cream underside.

## Партия 7 из 13

31. **mob-fox** — Лиса-огневка (портрет `fox.webp`): A sly red fox mid-step, bushy tail flaring up like a flame with a white tip, pointed ears, a clever grin, small embers drifting from the tail. Bright orange-red fur, white chest, dark socks.
32. **mob-badger** — Барсук (портрет `badger.webp`): A stocky badger with a black-and-white striped face, strong digging claws, stiff bristles raised along the back, a stubborn low stance. Gray-silver coat, black and white face, pale claws.
33. **mob-owl** — Филин (портрет `owl.webp`): A large eagle owl with ear tufts perched on a branch, round golden eyes, wings slightly open ready to glide, claws gripping a small stolen gem. Brown mottled feathers, golden eyes, a blue gem.
34. **mob-otter** — Выдра-разбойница (портрет `otter.webp`): A quick river otter in a sneaky pose, a small striped bandana over its brow, a stolen silver fish in its paws, sleek wet fur, a mischievous look, ripples on the base. Dark brown fur, cream throat, a red bandana.
35. **mob-heron** — Цапля (портрет `heron.webp`): A tall long-legged marsh heron standing on one leg, a long sharp beak aimed forward, a thin crest, gray-blue wings tucked, reeds around the base. Blue-gray, white neck, a yellow beak.

## Партия 8 из 13

36. **mob-elk** — Лось (портрет `elk.webp`): A big elk with huge wide palmate antlers, a heavy shoulder hump, head lowered in a charge pose, breath mist from the nostrils. Dark brown coat, pale legs, cream antlers.
37. **mob-goat** — Горный козёл (портрет `goat.webp`): A sturdy mountain goat standing on a rocky ledge on the base, long curved ridged horns, a shaggy beard, a stubborn stare. Cream and gray fur, dark horns, gray rock.
38. **mob-eagle** — Орёл (портрет `eagle.webp`): A fierce eagle diving down with spread wings, talons forward, a hooked beak and a hard golden eye, the wings wide enough to hide part of the frame. Dark brown, white head, golden talons and beak.
39. **mob-rhino** — Носорог (портрет `rhino.webp`): A heavy armored rhinoceros lowering its horn, thick wrinkled gray plates like armor on the shoulders, small ears, short strong legs, dust on the base. Slate gray, pale horn, dusty tan.
40. **mob-leopard** — Снежный барс (портрет `leopard.webp`): A snow leopard crouched on a frosty rock, thick pale-gray fur with dark rosettes, a very long fluffy tail, pale ice-blue eyes, a faint cold mist around the paws. Silver-white, dark gray rosettes, ice blue.

## Партия 9 из 13

41. **mob-leech** — Гигантская пиявка (портрет `leech.webp`): A giant calf-sized leech, a glossy dark green-black segmented body rearing up, a round toothy sucker mouth, orange stripes along the back, wet slime shining on the base. Dark green, black, orange stripes.
42. **mob-mimic** — Мимик (портрет `mimic.webp`): A wooden treasure chest with iron bands that is actually a monster: the lid open with rows of sharp teeth and a long pink tongue, two eyes glowing yellow inside, coins spilling out. Brown wood, dark iron, gold coins, pink tongue.
43. **mob-salamander** — Саламандра (портрет `salamander.webp`): A fire salamander lizard with a black body covered in glowing orange spots and stripes, a tail ending in a small flame, embers drifting around it, standing on warm dark stone. Black, bright orange, ember red.
44. **mob-bear** — Медведь-шатун (портрет `bear.webp`): A huge brown bear rising on its hind legs, roaring with open jaws, long claws out, thin from hunger, dry leaves and a broken branch stuck in the fur. Brown, tan muzzle, ivory claws.
45. **mob-griffin** — Грифон (портрет `griffin.webp`): A griffin with the head and wings of an eagle and the body of a lion, one front claw raised, wings half spread, a fierce golden eye, a feathered mane. White-brown feathers, tawny lion body, golden beak.

## Партия 10 из 13

46. **mob-wyvern** — Виверна (портрет `wyvern.webp`): A wyvern with two bat wings that are also its front legs, a long barbed tail ending in a venom stinger, a drop of green poison on it, a pointed head with a frill. Dark green scales, tan belly, poison green.
47. **mob-basilisk** — Василиск (портрет `basilisk.webp`): A serpent-lizard basilisk with a crest of bony spikes, a stone-gray scaly body with a pale petrified-stone texture creeping up from the base, glowing pale yellow eyes. Gray-green, pale yellow eyes, stone gray.
48. **mob-ironscarab** — Железный скарабей (портрет `ironscarab.webp`): A big beetle in an iron-plated shell with rivets, jaws shaped like two pickaxes, short strong legs, sparks on the mandibles, a bit of ore on the base. Dark steel gray, copper rivets, orange sparks.
49. **mob-rocklizard** — Скальная ящерица (портрет `rocklizard.webp`): A lizard that looks like a piece of rock: gray-brown stony scales with lichen patches, a flat head, a tail with ridges, perched on a boulder on the base. Gray-brown, lichen green, a yellow eye.
50. **mob-moonmoth** — Лунный мотылёк (портрет `moonmoth.webp`): A large pale moth with spread feathery wings patterned with moon-like circles, soft glowing dust falling from the wings, fuzzy antennae, resting on a small branch. Pale silver and cream, a gentle blue glow.

## Партия 11 из 13

51. **mob-bumblebee** — Шмель (портрет `bumblebee.webp`): A fuzzy round bumblebee big as a dog, thick black and yellow fur, small wings, a determined face, a sticky blob of honey dripping from the legs on the base. Yellow, black, amber honey.
52. **mob-forestling** — Лесовичок (портрет `forestling.webp`): A grumpy little stump creature with moss on its shoulders, twig arms and a bark face, deep-set angry eyes, mushrooms growing on its head, roots as feet. Brown bark, green moss, red mushroom caps.
53. **mob-barrowman** — Курганник (портрет `barrowman.webp`): A burial mound guardian in a rusty horned helm and a rotting mail, a corroded long sword, a tattered cloak, glowing dim green eyes in the dark helmet, a bit of earth and bone on the base. Rust brown, dark gray, sickly green glow.
54. **mob-crystalid** — Кристальник (портрет `crystalid.webp`): A squat stone dwarf-like creature with raw colorful crystals growing out of the back and shoulders, small fists of rock, blue and violet crystals faintly glowing, a simple stone face. Gray stone, blue, violet, pink crystals.
55. **mob-firetail** — Огнехвост (портрет `firetail.webp`): A young dragon with small wings and a big head, the tail ending in a burning flame, a puff of smoke from the nostrils, scales just growing in, playful but fierce. Orange-red scales, yellow belly, fire orange tail.

## Партия 12 из 13

56. **mob-weaver** — Паук-ткач (портрет `weaver.webp`): A cave spider with a pale cross-shaped mark on the dark back, thick sticky strands of web wrapped around its legs, a small bundled cocoon beside it on the base. Dark brown, cream mark, silver web.
57. **mob-carapace** — Панцирник (портрет `carapace.webp`): A huge reef crab with a barnacle- and shell-covered armored carapace, a giant claw and a smaller one, small eyes on stalks, seaweed hanging, sea foam on the base. Red-brown shell, cream barnacles, sea green.
58. **mob-ironguard** — Железный страж (портрет `ironguard.webp`): An empty suit of old plate armor standing guard with a heavy gauntlet raised, a tall plumed helmet with a dark visor and nothing inside but a faint cold glow, a dented tower shield. Dark steel, rust, a pale blue glow.
59. **mob-boneknight** — Костяной рыцарь (портрет `boneknight.webp`): A skeleton knight in blackened plate armor, a long sword held in a parade stance, a tall helm with a cold blue fire burning in the eye sockets, a tattered black cape. Black steel, bone, bright cold blue.
60. **mob-ogre** — Огр (портрет `ogre.webp`): A massive ogre with a big belly and a small head, a club made from a whole tree trunk resting on the shoulder, a necklace of bones, patched hide pants, a dull cruel grin. Mustard-gray skin, brown hide, pale wood.

## Партия 13 из 13

61. **mob-berserk** — Гоблин-берсерк (портрет `berserk.webp`): A frenzied goblin with wild eyes, spotted red mushrooms stuck in the hair and belt, two small axes swinging, foam on a toothy grin, ragged fur vest. Green skin, red and white mushroom spots, steel axes.
62. **mob-assassin** — Тень-убийца (портрет `assassin.webp`): A lean cloaked assassin made of shadow, a hood hiding the face, two glowing red eyes, a long black blade with a drop of green poison, crouched mid-step. Black, deep violet, venom green, a red glint.
