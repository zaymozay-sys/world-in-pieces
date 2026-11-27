# Анализ расходников v2.5.5 (27.11.2026)

Базовый коммит: `531354e6a938738fb3c557d970f7c523edb5501d` (после PR #3). Запуск: `WIP_N=60 node tools/qa-focus.js`. 42 240 боёв (22 профиля × 32 сценария × 60), фиксированный seed 256, 4 фракции, 4 цвета, 8 допустимых на карте противников, экипировка из обычных/редких вещей в основных слотах, без метательного оружия, чтобы сохранились собственные снаряды фракций. Магия включена, только модель PvE. Варианты боеприпасов проверены при мастерстве изготовления 5, а не при уровне героя.

Ниже win/delta (%) / used (среднее число использованных предметов) / costPct (затраты как доля базовых монет за победу, среднее отношений по сценариям) / netDeltaPct (изменение ожидаемых монет относительно контроля, в % базовой монетной награды) / actions. Для эликсиров учитывается только плата за варку, без ресурсов; для усиленных зарядов оценка целевой стоимости рецепта до округления, для обычных цена покупки. Не учтены продажа ресурсов, вещей, другие источники монет и бесплатные запасы. Не трактовать как полный бюджет игрока. Модель боеприпасов воспроизводит правила из ammo.js и game.js, но требует отдельного подтверждения в браузере. Разница в пределах нескольких процентных пунктов может быть шумом выборки.

```text
baseline {"win":"69.4","delta":"0.0","used":"0.00","costPct":"0.0","netDeltaPct":"0.0","actions":"9.6"}
ammo-1 {"win":"71.4","delta":"2.0","used":"1.00","costPct":"2169.9","netDeltaPct":"-2167.9","actions":"9.1"}
ammo-5 {"win":"77.1","delta":"7.8","used":"4.01","costPct":"8916.1","netDeltaPct":"-8908.4","actions":"8.1"}
ammo-hard {"win":"78.1","delta":"8.7","used":"3.96","costPct":"7920.6","netDeltaPct":"-7911.9","actions":"7.9"}
ammo-hunt {"win":"77.7","delta":"8.3","used":"3.99","costPct":"7967.8","netDeltaPct":"-7959.5","actions":"8.0"}
ammo-heal {"win":"84.1","delta":"14.7","used":"4.08","costPct":"8770.3","netDeltaPct":"-8755.6","actions":"8.4"}
ammo-charm {"win":"80.0","delta":"10.6","used":"3.86","costPct":"9249.3","netDeltaPct":"-9238.7","actions":"7.7"}
ammo-light {"win":"77.3","delta":"7.9","used":"4.47","costPct":"11850.0","netDeltaPct":"-11842.0","actions":"8.0"}
elixir-power {"win":"72.3","delta":"2.9","used":"0.89","costPct":"245.6","netDeltaPct":"-242.7","actions":"9.0"}
elixir-defense {"win":"74.0","delta":"4.6","used":"1.00","costPct":"267.2","netDeltaPct":"-262.5","actions":"9.7"}
elixir-block {"win":"73.6","delta":"4.3","used":"1.00","costPct":"267.2","netDeltaPct":"-262.9","actions":"9.6"}
elixir-ricochet {"win":"72.6","delta":"3.2","used":"1.00","costPct":"267.2","netDeltaPct":"-264.0","actions":"9.8"}
elixir-leech {"win":"68.1","delta":"-1.3","used":"0.89","costPct":"245.6","netDeltaPct":"-246.9","actions":"9.6"}
elixir-venom {"win":"69.8","delta":"0.5","used":"0.89","costPct":"245.6","netDeltaPct":"-245.1","actions":"9.6"}
elixir-fury {"win":"71.0","delta":"1.6","used":"1.00","costPct":"267.2","netDeltaPct":"-265.5","actions":"8.1"}
elixir-cunning {"win":"72.5","delta":"3.1","used":"1.00","costPct":"267.2","netDeltaPct":"-264.0","actions":"9.5"}
elixir-health {"win":"75.9","delta":"6.6","used":"0.51","costPct":"168.1","netDeltaPct":"-161.5","actions":"10.1"}
elixir-stones {"win":"71.1","delta":"1.8","used":"0.97","costPct":"262.7","netDeltaPct":"-260.9","actions":"9.0"}
elixir-swap {"win":"69.4","delta":"-0.0","used":"0.91","costPct":"250.0","netDeltaPct":"-250.0","actions":"9.2"}
elixir-road {"win":"72.6","delta":"3.2","used":"1.00","costPct":"267.2","netDeltaPct":"-263.9","actions":"9.7"}
elixir-speed {"win":"71.2","delta":"1.8","used":"1.00","costPct":"267.2","netDeltaPct":"-265.3","actions":"9.8"}
elixir-wit {"win":"71.0","delta":"1.7","used":"1.00","costPct":"267.2","netDeltaPct":"-265.5","actions":"9.5"}
FACTION human
baseline {"win":"68.7","delta":"0.0","used":"0.00","costPct":"0.0","netDeltaPct":"0.0","actions":"8.7"}
ammo-1 {"win":"70.4","delta":"1.7","used":"0.99","costPct":"1852.2","netDeltaPct":"-1850.6","actions":"8.6"}
ammo-5 {"win":"72.3","delta":"3.5","used":"4.13","costPct":"7751.8","netDeltaPct":"-7748.3","actions":"8.2"}
ammo-hard {"win":"71.9","delta":"3.1","used":"4.11","costPct":"7524.4","netDeltaPct":"-7521.3","actions":"8.1"}
ammo-hunt {"win":"72.1","delta":"3.3","used":"4.12","costPct":"7531.9","netDeltaPct":"-7528.6","actions":"8.2"}
ammo-heal {"win":"79.4","delta":"10.6","used":"4.19","costPct":"8261.1","netDeltaPct":"-8250.4","actions":"8.6"}
ammo-charm {"win":"76.7","delta":"7.9","used":"3.96","costPct":"8696.5","netDeltaPct":"-8688.6","actions":"7.9"}
ammo-light {"win":"71.7","delta":"2.9","used":"4.58","costPct":"11112.8","netDeltaPct":"-11109.9","actions":"8.2"}
FACTION dwarf
baseline {"win":"68.3","delta":"0.0","used":"0.00","costPct":"0.0","netDeltaPct":"0.0","actions":"10.0"}
ammo-1 {"win":"71.0","delta":"2.7","used":"1.00","costPct":"2270.7","netDeltaPct":"-2268.0","actions":"8.9"}
ammo-5 {"win":"79.0","delta":"10.6","used":"3.58","costPct":"8427.9","netDeltaPct":"-8417.3","actions":"6.4"}
ammo-hard {"win":"80.8","delta":"12.5","used":"3.45","costPct":"7162.3","netDeltaPct":"-7149.8","actions":"6.0"}
ammo-hunt {"win":"80.2","delta":"11.9","used":"3.53","costPct":"7282.3","netDeltaPct":"-7270.4","actions":"6.3"}
ammo-heal {"win":"88.5","delta":"20.2","used":"3.68","costPct":"8210.5","netDeltaPct":"-8190.3","actions":"6.7"}
ammo-charm {"win":"82.1","delta":"13.8","used":"3.46","costPct":"8540.7","netDeltaPct":"-8526.9","actions":"6.3"}
ammo-light {"win":"84.0","delta":"15.6","used":"4.13","costPct":"11386.8","netDeltaPct":"-11371.1","actions":"5.9"}
FACTION elf
baseline {"win":"71.9","delta":"0.0","used":"0.00","costPct":"0.0","netDeltaPct":"0.0","actions":"10.2"}
ammo-1 {"win":"73.5","delta":"1.7","used":"1.00","costPct":"2281.9","netDeltaPct":"-2280.2","actions":"9.6"}
ammo-5 {"win":"84.4","delta":"12.5","used":"4.11","costPct":"9679.2","netDeltaPct":"-9666.7","actions":"9.0"}
ammo-hard {"win":"84.4","delta":"12.5","used":"4.09","costPct":"8451.9","netDeltaPct":"-8439.4","actions":"8.9"}
ammo-hunt {"win":"84.4","delta":"12.5","used":"4.11","costPct":"8483.7","netDeltaPct":"-8471.2","actions":"9.0"}
ammo-heal {"win":"88.8","delta":"16.9","used":"4.15","costPct":"9213.8","netDeltaPct":"-9196.9","actions":"9.1"}
ammo-charm {"win":"85.6","delta":"13.7","used":"4.01","costPct":"10003.1","netDeltaPct":"-9989.3","actions":"8.6"}
ammo-light {"win":"81.3","delta":"9.4","used":"4.53","costPct":"12355.2","netDeltaPct":"-12345.9","actions":"8.9"}
FACTION lizard
baseline {"win":"68.5","delta":"0.0","used":"0.00","costPct":"0.0","netDeltaPct":"0.0","actions":"9.6"}
ammo-1 {"win":"70.4","delta":"1.9","used":"1.00","costPct":"2274.8","netDeltaPct":"-2272.9","actions":"9.2"}
ammo-5 {"win":"72.9","delta":"4.4","used":"4.23","costPct":"9805.6","netDeltaPct":"-9801.2","actions":"8.7"}
ammo-hard {"win":"75.4","delta":"6.9","used":"4.18","costPct":"8543.9","netDeltaPct":"-8537.0","actions":"8.5"}
ammo-hunt {"win":"74.0","delta":"5.4","used":"4.20","costPct":"8573.2","netDeltaPct":"-8567.8","actions":"8.5"}
ammo-heal {"win":"79.6","delta":"11.0","used":"4.29","costPct":"9395.8","netDeltaPct":"-9384.8","actions":"9.0"}
ammo-charm {"win":"75.6","delta":"7.1","used":"4.02","costPct":"9757.1","netDeltaPct":"-9750.1","actions":"8.0"}
ammo-light {"win":"72.3","delta":"3.8","used":"4.66","costPct":"12545.1","netDeltaPct":"-12541.3","actions":"8.8"}
```

## Вывод

- Целебные снаряды оказались наиболее эффективны по доле побед в протестированных условиях, но их стоимость высока.
- Из одиночных эликсиров заметный эффект дали жизнь, броня, блок. Эффект регенерации и превращения следует повторно проверить.
- Цена боеприпасов и плата за эликсиры на высоких цветах несоразмерны прямой монетной награде за обычных существ. Требуется отдельный аудит полной экономики (ресурсы, вещи, продажи, квесты, альтернативные источники дохода), прежде чем менять цены.
- Не изменять боевые характеристики или цены до проверки полной экономики и согласования целевых ориентиров.
