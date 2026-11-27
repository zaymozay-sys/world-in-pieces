# Экономика v2.5.6 — первичный аудит 27.11.2026

158 400 выборок добычи, 4 фракции × 99 уровней × 400 выборок. Скрипт: `node tools/qa-economy-256.js`. Выбираются равновесно обычные доступные на карте виды соответствующего цвета, уровень монстра равен уровню героя. Дневная добыча без элиты, временных бонусов, особых зон и режимов. Полная ликвидация = монеты + стоимость продажи ВСЕХ ресурсов и вещей по ценам NPC; это верхняя граница оборота, не наличные при сохранении материалов. Кузница и эликсиры: плата плюс упущенная стоимость продажи ресурсов. Комплект — легальные обычные вещи из доступного каталога; обновлять его каждый цвет необязательно. Окупаемость условная, не динамический симулятор покупок.

## По цветам
```text
1 {"wins":340,"coins":17,"res":31,"item":11,"full":58,"resN":2,"itemN":0,"buy":1411,"forge":603,"upgrade":0,"repair":17,"ammoShop":127,"petFeed":15,"petApple":100,"petRepair":70,"petTrainNext":1250,"petGear":750,"evolve":0,"milestone":2395,"dailyPer10Wins":4849,"ammoCraft":85,"ammoHeal":124,"health":18,"power":26,"defense":18,"buyWins":24,"forgeWins":10,"craftAmmoRatio":1.46,"healthRatio":0.31,"net70":36,"cash70":7,"net70wPet":0}
2 {"wins":390,"coins":44,"res":66,"item":23,"full":133,"resN":2,"itemN":0,"buy":3884,"forge":1979,"upgrade":2047,"repair":36,"ammoShop":311,"petFeed":38,"petApple":250,"petRepair":175,"petTrainNext":3000,"petGear":2625,"evolve":0,"milestone":5885,"dailyPer10Wins":13592,"ammoCraft":208,"ammoHeal":304,"health":46,"power":66,"defense":46,"buyWins":29,"forgeWins":15,"craftAmmoRatio":1.56,"healthRatio":0.35,"net70":82,"cash70":20,"net70wPet":-8}
3 {"wins":453,"coins":84,"res":150,"item":63,"full":296,"resN":2,"itemN":0,"buy":10158,"forge":5169,"upgrade":6149,"repair":82,"ammoShop":760,"petFeed":90,"petApple":600,"petRepair":420,"petTrainNext":7500,"petGear":7125,"evolve":0,"milestone":47727,"dailyPer10Wins":38744,"ammoCraft":510,"ammoHeal":741,"health":113,"power":161,"defense":113,"buyWins":34,"forgeWins":17,"craftAmmoRatio":1.72,"healthRatio":0.38,"net70":183,"cash70":34,"net70wPet":-33}
4 {"wins":529,"coins":141,"res":324,"item":136,"full":600,"resN":2,"itemN":0,"buy":27511,"forge":11419,"upgrade":16651,"repair":195,"ammoShop":1848,"petFeed":225,"petApple":1500,"petRepair":1050,"petTrainNext":17500,"petGear":18375,"evolve":0,"milestone":9496,"dailyPer10Wins":108976,"ammoCraft":994,"ammoHeal":1407,"health":232,"power":326,"defense":232,"buyWins":46,"forgeWins":19,"craftAmmoRatio":1.66,"healthRatio":0.39,"net70":362,"cash70":40,"net70wPet":-178}
5 {"wins":606,"coins":230,"res":606,"item":277,"full":1113,"resN":2,"itemN":0,"buy":69127,"forge":24832,"upgrade":38245,"repair":440,"ammoShop":4275,"petFeed":525,"petApple":3500,"petRepair":2450,"petTrainNext":40000,"petGear":44625,"evolve":42000,"milestone":77331,"dailyPer10Wins":288635,"ammoCraft":1956,"ammoHeal":2749,"health":472,"power":650,"defense":472,"buyWins":62,"forgeWins":22,"craftAmmoRatio":1.76,"healthRatio":0.42,"net70":647,"cash70":29,"net70wPet":-613}
6 {"wins":664,"coins":374,"res":1344,"item":582,"full":2300,"resN":2,"itemN":0,"buy":169290,"forge":54321,"upgrade":82189,"repair":980,"ammoShop":9027,"petFeed":1200,"petApple":8000,"petRepair":5600,"petTrainNext":75000,"petGear":104625,"evolve":0,"milestone":232385,"dailyPer10Wins":650786,"ammoCraft":3742,"ammoHeal":5127,"health":1000,"power":1352,"defense":1000,"buyWins":74,"forgeWins":24,"craftAmmoRatio":1.63,"healthRatio":0.43,"net70":1316,"cash70":-32,"net70wPet":-1564}
7 {"wins":736,"coins":596,"res":2925,"item":1177,"full":4699,"resN":2,"itemN":0,"buy":359741,"forge":110835,"upgrade":182310,"repair":1909,"ammoShop":16895,"petFeed":2250,"petApple":15000,"petRepair":10500,"petTrainNext":140000,"petGear":217125,"evolve":0,"milestone":126474,"dailyPer10Wins":1350784,"ammoCraft":6629,"ammoHeal":9011,"health":1944,"power":2556,"defense":1944,"buyWins":77,"forgeWins":24,"craftAmmoRatio":1.41,"healthRatio":0.41,"net70":2716,"cash70":-155,"net70wPet":-2684}
8 {"wins":837,"coins":867,"res":4481,"item":1933,"full":7281,"resN":2,"itemN":0,"buy":671517,"forge":190357,"upgrade":333519,"repair":3289,"ammoShop":30482,"petFeed":4200,"petApple":28000,"petRepair":19600,"petTrainNext":240000,"petGear":427125,"evolve":0,"milestone":795272,"dailyPer10Wins":2742704,"ammoCraft":10763,"ammoHeal":14360,"health":4532,"power":5516,"defense":4532,"buyWins":92,"forgeWins":26,"craftAmmoRatio":1.48,"healthRatio":0.62,"net70":4110,"cash70":-380,"net70wPet":-5970}
9 {"wins":969,"coins":1169,"res":7434,"item":3030,"full":11633,"resN":2,"itemN":0,"buy":1151172,"forge":303139,"upgrade":614631,"repair":5233,"ammoShop":51149,"petFeed":7200,"petApple":48000,"petRepair":33600,"petTrainNext":390000,"petGear":787125,"evolve":0,"milestone":1086579,"dailyPer10Wins":5298439,"ammoCraft":16599,"ammoHeal":21911,"health":8596,"power":10092,"defense":8596,"buyWins":99,"forgeWins":26,"craftAmmoRatio":1.43,"healthRatio":0.74,"net70":6573,"cash70":-751,"net70wPet":-10707}
10 {"wins":1015,"coins":1495,"res":12154,"item":4616,"full":18265,"resN":2,"itemN":0,"buy":1870655,"forge":477545,"upgrade":1007722,"repair":7939,"ammoShop":83116,"petFeed":11700,"petApple":78000,"petRepair":54600,"petTrainNext":0,"petGear":1372125,"evolve":936000,"milestone":235373,"dailyPer10Wins":8773969,"ammoCraft":26031,"ammoHeal":34102,"health":19018,"power":21326,"defense":19018,"buyWins":102,"forgeWins":26,"craftAmmoRatio":1.43,"healthRatio":1.04,"net70":10404,"cash70":-1335,"net70wPet":-17676}
TOTAL EST WINS 0 6538.698398019982
```

## Сценарий: 70% побед, продажа 50% ресурсов и 75% предметов
Дневное поручение при десяти победах в день и однократные вехи 10/50/100 побед над видом учтены отдельно. `netDailyPet` — стресс-сценарий ремонта питомца при каждом поражении, не точная формула парного боя. При парном бое реальная прочность теряется при общей неудаче и поражении питомца, см. следующий раздел.
```text
1 {"partial":40,"daily":14,"milestone":7,"netPartial":23,"netDaily":38,"netDailyPet":2,"ammoShopPerFull":2.18,"petFeedPerFull":0.26,"petRepairPerFull":1.2,"healthPerFull":0.31}
2 {"partial":94,"daily":35,"milestone":15,"netPartial":55,"netDaily":90,"netDailyPet":0,"ammoShopPerFull":2.34,"petFeedPerFull":0.28,"petRepairPerFull":1.31,"healthPerFull":0.35}
3 {"partial":206,"daily":86,"milestone":105,"netPartial":119,"netDaily":253,"netDailyPet":37,"ammoShopPerFull":2.57,"petFeedPerFull":0.3,"petRepairPerFull":1.42,"healthPerFull":0.38}
4 {"partial":405,"daily":206,"milestone":18,"netPartial":225,"netDaily":382,"netDailyPet":-158,"ammoShopPerFull":3.08,"petFeedPerFull":0.37,"petRepairPerFull":1.75,"healthPerFull":0.39}
5 {"partial":740,"daily":476,"milestone":128,"netPartial":386,"netDaily":809,"netDailyPet":-451,"ammoShopPerFull":3.84,"petFeedPerFull":0.47,"petRepairPerFull":2.2,"healthPerFull":0.42}
6 {"partial":1483,"daily":981,"milestone":350,"netPartial":744,"netDaily":1676,"netDailyPet":-1204,"ammoShopPerFull":3.93,"petFeedPerFull":0.52,"petRepairPerFull":2.44,"healthPerFull":0.43}
7 {"partial":2942,"daily":1834,"milestone":172,"netPartial":1486,"netDaily":2891,"netDailyPet":-2509,"ammoShopPerFull":3.6,"petFeedPerFull":0.48,"petRepairPerFull":2.24,"healthPerFull":0.41}
8 {"partial":4557,"daily":3277,"milestone":950,"netPartial":2204,"netDaily":5163,"netDailyPet":-4917,"ammoShopPerFull":4.19,"petFeedPerFull":0.58,"petRepairPerFull":2.69,"healthPerFull":0.62}
9 {"partial":7159,"daily":5468,"milestone":1121,"netPartial":3441,"netDaily":8054,"netDailyPet":-9226,"ammoShopPerFull":4.4,"petFeedPerFull":0.62,"petRepairPerFull":2.89,"healthPerFull":0.74}
10 {"partial":11034,"daily":8641,"milestone":232,"netPartial":5342,"netDaily":11554,"netDailyPet":-16526,"ammoShopPerFull":4.55,"petFeedPerFull":0.64,"petRepairPerFull":2.99,"healthPerFull":1.04}
TOTAL 6539
```

## Связь с симуляцией питомцев
Использованы результаты PR #4, 4 цвета, 3 профиля питомца, два врага в последовательной модели. Чистый доход: две награды при победе, продажа 50% ресурсов и 75% вещей, ремонт героя при поражении, постоянный корм, ремонт питомца только при проигранном его поле и общем проигрыше. Не включены дневные награды, квесты, улучшения питомца, специальные угощения и стоимость покупки экипировки. Потеря прочности оценена по последовательной модели, а не по одновременной браузерной.
```text
1 novice {"win":"95.0","petLoss":"4.4","net":58}
1 trained {"win":"97.2","petLoss":"0.0","net":63}
1 prepared {"win":"97.2","petLoss":"0.0","net":63}
4 novice {"win":"61.9","petLoss":"31.9","net":-133}
4 trained {"win":"76.6","petLoss":"2.8","net":319}
4 prepared {"win":"76.9","petLoss":"0.0","net":352}
7 novice {"win":"60.6","petLoss":"31.6","net":-2759}
7 trained {"win":"75.9","petLoss":"0.3","net":1716}
7 prepared {"win":"75.9","petLoss":"0.0","net":1749}
10 novice {"win":"41.9","petLoss":"40.6","net":-29225}
10 trained {"win":"46.3","petLoss":"0.0","net":-5734}
10 prepared {"win":"46.3","petLoss":"0.0","net":-5734}
```

## Выводы и кандидаты к следующему эксперименту
- Около 6539 побед до уровня 100 при данной стратегии выбора противников; при 70% побед ~9341 попытка. Не учитывать как фактическое время прохождения.
- На 1/4/7/10 цветах полная ликвидная награда ~58/600/4699/18265 монет. Обычный снаряд Лавки ~127/1848/16895/83116; варка с ресурсами и комиссией также дороже полной награды на всех цветах.
- Базовые монеты после 6 цвета могут не покрыть ремонт при частых поражениях, если не продавать добычу и не выполнять поручения.
- Эликсиры жизни дорожают от 31% полной награды на 1-м до 104% на 10-м. Надо проверять отдельную ценовую кривую расходников, а не общую инфляцию.
- Обычный корм и ремонт питомца на высоких цветах могут превышать доход неподготовленного героя. Подготовленный питомец значительно уменьшает расходы на собственные поражения; автоматический рост цвета через XP позволяет не покупать каждый следующий цвет.
- Этапы для следующего сценария: цена обычного снаряда 20–35% типовой полной награды на цвете, эликсир жизни 25–40%, корм 15–25% за бой, ремонт питомца 50–100% полной награды за потерю прочности. Это тестовые ориентиры, а не утвержденные правила. Сопоставить с сохранением ресурсов, квестами/сундуками, рыночными ценами и реальной динамикой прогрессии. Не изменять опубликованную версию или цены до проверки.
- PR #4: все проверки GitHub успешны, изменения питомцев объединены в main `cd56c3821b63faa2e87f9167cc80d02901c6207e`.
