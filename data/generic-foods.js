// Curated generic foods. Values per 100 g (kcal, protein, carbs, fat, fiber, sugar, sodium mg),
// based on USDA FoodData Central figures. Servings are [label, grams].
// Rows: [name, kcal, p, c, f, fiber, sugar, sodium, servings, keywords]
// keyword tokens "approx" (composite dish estimate) and "alcohol" are flags as well as search hints.

const R = [
  // Proteins
  ['Chicken breast, cooked', 165, 31, 0, 3.6, 0, 0, 74, [['1 small breast', 120], ['1 breast', 172]], 'grilled baked skinless'],
  ['Chicken thigh, cooked', 209, 26, 0, 10.9, 0, 0, 88, [['1 thigh', 116]], 'skinless'],
  ['Rotisserie chicken, meat + skin', 205, 26, 0, 11, 0, 0, 350, [['1 cup shredded', 140]], 'approx'],
  ['Ground beef 80/20, cooked', 254, 26, 0, 16, 0, 0, 79, [['1 patty', 85], ['4 oz cooked', 113]], 'hamburger mince'],
  ['Ground beef 90/10, cooked', 196, 26, 0, 10, 0, 0, 72, [['1 patty', 85], ['4 oz cooked', 113]], 'lean mince'],
  ['Ground turkey 93/7, cooked', 207, 27, 0, 10.4, 0, 0, 78, [['4 oz cooked', 113]], 'mince'],
  ['Ground pork, cooked', 297, 25.7, 0, 20.8, 0, 0, 62, [['4 oz cooked', 113]], 'mince'],
  ['Steak, sirloin, grilled', 212, 29, 0, 10, 0, 0, 55, [['1 small steak', 150], ['1 steak', 225]], 'beef top'],
  ['Pork chop, grilled', 214, 27, 0, 11, 0, 0, 50, [['1 chop', 145]], 'boneless'],
  ['Bacon, cooked', 541, 37, 1.4, 42, 0, 0, 1717, [['1 slice', 8], ['3 slices', 24]], 'strip'],
  ['Pork breakfast sausage, cooked', 325, 18, 1.4, 27, 0, 0, 800, [['1 link', 25], ['2 links', 50]], ''],
  ['Pepperoni', 494, 19, 1.2, 44, 0, 0, 1761, [['15 slices', 28]], 'salami'],
  ['Hot dog, beef', 322, 11.2, 2.9, 29, 0, 1, 1090, [['1 frank', 52]], 'frankfurter wiener'],
  ['Ham, deli sliced', 110, 17, 1.5, 3.5, 0, 1, 1050, [['1 slice', 28], ['3 slices', 84]], 'lunch meat'],
  ['Turkey breast, deli sliced', 99, 17, 2.3, 2, 0, 1, 950, [['1 slice', 28], ['3 slices', 84]], 'lunch meat'],
  ['Salmon, cooked', 206, 22.1, 0, 12.4, 0, 0, 61, [['1 fillet', 150]], 'atlantic baked'],
  ['Tuna, canned in water', 86, 19.4, 0, 1, 0, 0, 338, [['1 can drained', 120], ['1/2 can', 60]], 'light chunk'],
  ['Shrimp, cooked', 99, 23.5, 0.2, 0.6, 0, 0, 224, [['6 large', 60], ['3 oz', 85]], 'prawns'],
  ['Cod, cooked', 105, 22.8, 0, 0.9, 0, 0, 78, [['1 fillet', 120]], 'white fish'],
  ['Tilapia, cooked', 128, 26.2, 0, 2.7, 0, 0, 56, [['1 fillet', 115]], 'white fish'],
  ['Egg, large', 155, 12.6, 1.1, 10.6, 0, 1.1, 124, [['1 large', 50], ['2 large', 100], ['3 large', 150]], 'boiled poached whole'],
  ['Egg, fried', 196, 13.6, 0.8, 14.8, 0, 0.4, 207, [['1 large', 46], ['2 large', 92]], ''],
  ['Egg whites', 52, 10.9, 0.7, 0.2, 0, 0.7, 166, [['1 large white', 33], ['1/4 cup', 61]], ''],
  ['Tofu, firm', 76, 8.1, 1.9, 4.8, 0.3, 0, 7, [['3 oz', 85], ['1/2 block', 175]], ''],
  ['Tempeh', 192, 20.3, 7.6, 10.8, null, 0, 9, [['3 oz', 85]], ''],
  ['Whey protein powder', 400, 80, 10, 5, 0, 5, 300, [['1 scoop', 30], ['2 scoops', 60]], 'shake isolate'],
  ['Protein bar', 330, 33, 38, 12, 15, 4, 300, [['1 bar', 60]], 'quest'],
  ['Protein shake, ready to drink', 48, 9, 2.7, 0.9, 0, 2, 60, [['1 bottle (330 ml)', 330]], 'premier core power'],
  ['Beef jerky', 410, 33.2, 11, 25.6, 0, 9, 2081, [['1 oz', 28]], ''],

  // Dairy
  ['Greek yogurt, plain nonfat', 59, 10.2, 3.6, 0.4, 0, 3.2, 36, [['3/4 cup', 170], ['1 cup', 245]], '0%'],
  ['Greek yogurt, plain 2%', 73, 9.9, 3.9, 1.9, 0, 3.6, 34, [['3/4 cup', 170], ['1 cup', 245]], ''],
  ['Greek yogurt, plain whole', 97, 9, 3.9, 5, 0, 4, 35, [['3/4 cup', 170], ['1 cup', 245]], '5%'],
  ['Skyr, plain', 63, 11, 4, 0.2, 0, 4, 46, [['1 container', 170]], 'icelandic yogurt'],
  ['Yogurt, plain whole milk', 61, 3.5, 4.7, 3.3, 0, 4.7, 46, [['1 cup', 245]], 'regular'],
  ['Cottage cheese, 2%', 84, 11, 4.3, 2.3, 0, 4, 330, [['1/2 cup', 113], ['1 cup', 226]], ''],
  ['Kefir, low fat', 46, 3.8, 4.8, 1, 0, 4.6, 40, [['1 cup', 243]], 'drinkable yogurt'],
  ['Milk, whole', 61, 3.2, 4.8, 3.3, 0, 5.1, 43, [['1 cup', 244], ['1/2 cup', 122]], '3.25%'],
  ['Milk, 2%', 50, 3.3, 4.8, 2, 0, 5.1, 47, [['1 cup', 244], ['1/2 cup', 122]], 'reduced fat'],
  ['Milk, skim', 34, 3.4, 5, 0.1, 0, 5.1, 42, [['1 cup', 245]], 'nonfat fat free'],
  ['Chocolate milk, 2%', 80, 3.2, 10.4, 2, 0.7, 9.6, 66, [['1 cup', 250]], ''],
  ['Almond milk, unsweetened', 13, 0.4, 0.6, 1.1, 0.2, 0.2, 72, [['1 cup', 240]], ''],
  ['Oat milk', 50, 1.3, 6.7, 2.1, 0.8, 2.9, 42, [['1 cup', 240]], 'oatly'],
  ['Soy milk, unsweetened', 33, 2.9, 1.2, 1.7, 0.2, 0.4, 38, [['1 cup', 240]], ''],
  ['Cheddar cheese', 403, 24.9, 1.3, 33.1, 0, 0.5, 621, [['1 slice', 21], ['1 oz', 28], ['1/4 cup shredded', 28]], ''],
  ['Mozzarella, part skim', 254, 24.3, 2.8, 15.9, 0, 1.1, 619, [['1 oz', 28], ['1/4 cup shredded', 28]], ''],
  ['String cheese', 286, 22, 2, 21, 0, 1, 640, [['1 stick', 28]], 'mozzarella snack'],
  ['Parmesan, grated', 431, 38.5, 4.1, 28.6, 0, 0.9, 1529, [['1 tbsp', 5], ['1/4 cup', 20]], ''],
  ['Feta cheese', 264, 14.2, 4.1, 21.3, 0, 4.1, 917, [['1/4 cup crumbled', 38]], ''],
  ['Cream cheese', 342, 5.9, 4.1, 34.2, 0, 3.2, 321, [['1 tbsp', 15], ['2 tbsp', 29]], ''],
  ['Butter, salted', 717, 0.9, 0.1, 81.1, 0, 0.1, 576, [['1 pat', 5], ['1 tbsp', 14]], ''],
  ['Heavy cream', 340, 2.8, 2.7, 36.1, 0, 2.9, 27, [['1 tbsp', 15], ['1/4 cup', 60]], 'whipping'],
  ['Half and half', 131, 3.1, 4.3, 11.5, 0, 4.8, 41, [['2 tbsp', 30]], 'coffee cream'],
  ['Sour cream', 198, 2.4, 4.6, 19.4, 0, 3.4, 31, [['2 tbsp', 30]], ''],
  ['Ice cream, vanilla', 207, 3.5, 23.6, 11, 0.7, 21.2, 80, [['1/2 cup', 66], ['1 cup', 132]], ''],

  // Grains and starches
  ['White rice, cooked', 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, [['1/2 cup', 79], ['1 cup', 158], ['1.5 cups', 237]], 'jasmine basmati steamed'],
  ['Brown rice, cooked', 123, 2.7, 25.6, 1, 1.6, 0.2, 4, [['1/2 cup', 98], ['1 cup', 195]], ''],
  ['Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, 0.6, 1, [['1 cup', 140], ['1.5 cups', 210], ['2 cups', 280]], 'spaghetti penne noodles'],
  ['Whole wheat pasta, cooked', 124, 5.3, 26.5, 0.5, 3.9, 0.8, 3, [['1 cup', 140], ['1.5 cups', 210]], 'noodles'],
  ['Quinoa, cooked', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, [['1/2 cup', 93], ['1 cup', 185]], ''],
  ['Couscous, cooked', 112, 3.8, 23.2, 0.2, 1.4, 0.1, 5, [['1 cup', 157]], ''],
  ['Oats, dry rolled', 379, 13.2, 67.7, 6.5, 10.1, 1, 6, [['1/3 cup', 27], ['1/2 cup', 40], ['1 cup', 81]], 'oatmeal porridge'],
  ['Oatmeal, cooked with water', 71, 2.5, 12, 1.5, 1.7, 0.3, 4, [['1 cup', 234]], 'porridge'],
  ['Bread, white', 265, 9, 49, 3.2, 2.7, 5, 490, [['1 slice', 28], ['2 slices', 56]], 'toast'],
  ['Bread, whole wheat', 247, 13, 41, 3.4, 6, 4.3, 450, [['1 slice', 32], ['2 slices', 64]], 'brown toast'],
  ['Sourdough bread', 240, 8, 47, 1.4, 2.4, 2, 513, [['1 slice', 50]], 'toast'],
  ['Bagel, plain', 257, 10, 50, 1.6, 2.1, 5, 430, [['1 bagel', 105], ['1/2 bagel', 52]], ''],
  ['English muffin', 227, 8.9, 44.2, 1.7, 3.5, 3.6, 448, [['1 muffin', 57]], ''],
  ['Tortilla, flour', 306, 8.2, 49, 8.3, 3.1, 3.7, 640, [['1 medium (8 in)', 46], ['1 large (10 in)', 72]], 'wrap'],
  ['Tortilla, corn', 218, 5.7, 44.6, 2.8, 6.3, 0.9, 45, [['1 tortilla', 26], ['2 tortillas', 52]], ''],
  ['Pita bread', 275, 9, 55, 1.2, 2.2, 0.8, 536, [['1 pita', 60]], ''],
  ['Naan', 310, 9, 52, 6, 2.2, 3.2, 540, [['1 naan', 90]], 'flatbread'],
  ['Potato, baked with skin', 93, 2.5, 21.2, 0.1, 2.2, 1.2, 10, [['1 medium', 173], ['1 large', 299]], ''],
  ['Sweet potato, baked', 90, 2, 20.7, 0.2, 3.3, 6.5, 36, [['1 medium', 114], ['1 large', 180]], 'yam'],
  ['Mashed potatoes', 113, 2, 17, 4.2, 1.5, 1.4, 330, [['1 cup', 210]], 'approx'],
  ['French fries', 312, 3.4, 41, 15.5, 3.8, 0.3, 210, [['1 small serving', 71], ['1 medium serving', 117], ['1 large serving', 154]], 'chips fast food'],
  ['Cereal, corn flakes', 357, 7.5, 84, 0.4, 3.3, 9, 660, [['1 cup', 28], ['1.5 cups', 42]], 'breakfast'],
  ['Cereal, toasted oat rings', 367, 12, 73, 6.4, 9.4, 4.4, 497, [['1 cup', 28], ['1.5 cups', 42]], 'cheerios breakfast'],
  ['Granola', 471, 10, 64, 20, 7, 20, 25, [['1/4 cup', 28], ['1/2 cup', 55]], ''],
  ['Rice cake', 387, 8.2, 81.5, 2.8, 4.2, 0.9, 26, [['1 cake', 9], ['2 cakes', 18]], ''],
  ['Crackers, saltine', 421, 9.5, 71, 8.6, 2.9, 1.6, 941, [['5 crackers', 15]], 'soda'],
  ['Pancake', 227, 6.4, 28.3, 9.7, 1.1, 6, 439, [['1 small (4 in)', 38], ['1 large (6 in)', 77]], ''],
  ['Waffle', 291, 7.9, 32.9, 14.1, 1.7, 8, 511, [['1 round (7 in)', 75]], ''],

  // Fruit
  ['Banana', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, [['1 medium', 118], ['1 large', 136]], ''],
  ['Apple', 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, [['1 medium', 182], ['1 small', 149]], ''],
  ['Orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, [['1 medium', 131]], ''],
  ['Clementine', 47, 0.9, 12, 0.2, 1.7, 9.2, 1, [['1 clementine', 74], ['2 clementines', 148]], 'mandarin'],
  ['Strawberries', 32, 0.7, 7.7, 0.3, 2, 4.9, 1, [['1 cup halved', 152]], 'berries'],
  ['Blueberries', 57, 0.7, 14.5, 0.3, 2.4, 10, 1, [['1 cup', 148], ['1/2 cup', 74]], 'berries'],
  ['Raspberries', 52, 1.2, 11.9, 0.7, 6.5, 4.4, 1, [['1 cup', 123]], 'berries'],
  ['Grapes', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2, [['1 cup', 151], ['10 grapes', 49]], ''],
  ['Watermelon', 30, 0.6, 7.6, 0.2, 0.4, 6.2, 1, [['1 cup diced', 152], ['1 wedge', 286]], ''],
  ['Pineapple', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 1, [['1 cup chunks', 165]], ''],
  ['Mango', 60, 0.8, 15, 0.4, 1.6, 13.7, 1, [['1 cup pieces', 165], ['1 mango', 336]], ''],
  ['Peach', 39, 0.9, 9.5, 0.3, 1.5, 8.4, 0, [['1 medium', 150]], ''],
  ['Pear', 57, 0.4, 15.2, 0.1, 3.1, 9.8, 1, [['1 medium', 178]], ''],
  ['Cherries', 63, 1.1, 16, 0.2, 2.1, 12.8, 0, [['1 cup', 154]], ''],
  ['Kiwi', 61, 1.1, 14.7, 0.5, 3, 9, 3, [['1 kiwi', 69], ['2 kiwis', 138]], ''],
  ['Avocado', 160, 2, 8.5, 14.7, 6.7, 0.7, 7, [['1/2 avocado', 75], ['1 avocado', 150], ['2 tbsp mashed', 30]], ''],
  ['Raisins', 299, 3.1, 79.2, 0.5, 3.7, 59.2, 11, [['1/4 cup', 41], ['small box', 43]], 'dried'],
  ['Dates, medjool', 277, 1.8, 75, 0.2, 6.7, 66.5, 1, [['1 date', 24], ['3 dates', 72]], 'dried'],

  // Vegetables
  ['Broccoli, cooked', 35, 2.4, 7.2, 0.4, 3.3, 1.4, 41, [['1 cup chopped', 156]], 'steamed'],
  ['Spinach, raw', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, [['2 cups', 60], ['4 cups', 120]], 'greens salad'],
  ['Kale, raw', 35, 2.9, 4.4, 1.5, 4.1, 0.8, 53, [['2 cups chopped', 42]], 'greens salad'],
  ['Lettuce, romaine', 17, 1.2, 3.3, 0.3, 2.1, 1.2, 8, [['2 cups shredded', 94]], 'salad greens'],
  ['Mixed salad greens', 20, 1.8, 3.7, 0.2, 2.1, 1.5, 25, [['2 cups', 60], ['4 cups', 120]], 'spring mix lettuce'],
  ['Tomato', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 5, [['1 medium', 123], ['1/2 cup cherry', 75]], ''],
  ['Cucumber', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 2, [['1/2 cucumber', 150], ['1 cup sliced', 104]], ''],
  ['Carrot', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 69, [['1 medium', 61], ['1 cup baby carrots', 128]], ''],
  ['Bell pepper', 26, 1, 6, 0.3, 2.1, 4.2, 4, [['1 medium', 119]], 'capsicum'],
  ['Onion', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, [['1/2 medium', 55], ['1 medium', 110]], ''],
  ['Mushrooms, raw', 22, 3.1, 3.3, 0.3, 1, 2, 5, [['1 cup sliced', 70]], 'white cremini'],
  ['Green beans, cooked', 35, 1.9, 7.9, 0.3, 3.2, 3.6, 1, [['1 cup', 125]], ''],
  ['Corn, sweet cooked', 96, 3.4, 21, 1.5, 2.4, 4.5, 1, [['1 ear', 90], ['1 cup kernels', 149]], ''],
  ['Peas, cooked', 84, 5.4, 15.6, 0.2, 5.5, 5.9, 3, [['1/2 cup', 80], ['1 cup', 160]], ''],
  ['Cauliflower, cooked', 23, 1.8, 4.1, 0.5, 2.3, 2.1, 15, [['1 cup', 124]], ''],
  ['Cauliflower rice', 25, 2, 5, 0.3, 2, 1.9, 26, [['1 cup', 107]], 'riced'],
  ['Zucchini, cooked', 16, 1.1, 2.9, 0.4, 1, 1.7, 3, [['1 cup sliced', 180]], 'courgette'],
  ['Asparagus, cooked', 22, 2.4, 4.1, 0.2, 2, 1.3, 14, [['6 spears', 90]], ''],
  ['Brussels sprouts, cooked', 36, 2.6, 7.1, 0.5, 2.6, 1.7, 21, [['1 cup', 156]], ''],
  ['Celery', 14, 0.7, 3, 0.2, 1.6, 1.3, 80, [['2 stalks', 80]], ''],
  ['Edamame, shelled', 121, 11.9, 8.9, 5.2, 5.2, 2.2, 6, [['1/2 cup', 78], ['1 cup', 155]], 'soybeans'],

  // Nuts, seeds, legumes
  ['Almonds', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, [['1 oz (23 nuts)', 28], ['1/4 cup', 36]], ''],
  ['Peanuts, roasted', 585, 23.7, 21.5, 49.7, 8.4, 4.9, 6, [['1 oz', 28], ['1/4 cup', 36]], ''],
  ['Peanut butter', 588, 25.1, 19.6, 50, 6, 9.2, 430, [['1 tbsp', 16], ['2 tbsp', 32]], 'pb'],
  ['Almond butter', 614, 21, 18.8, 55.5, 10.3, 4.4, 2, [['1 tbsp', 16], ['2 tbsp', 32]], ''],
  ['Cashews, roasted', 574, 15.3, 32.7, 46.4, 3, 5, 16, [['1 oz', 28], ['1/4 cup', 32]], ''],
  ['Walnuts', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 2, [['1 oz (14 halves)', 28]], ''],
  ['Pistachios, shelled', 562, 20.2, 27.2, 45.3, 10.6, 7.7, 1, [['1 oz', 28]], ''],
  ['Mixed nuts', 607, 16.8, 25.5, 54.1, 6.4, 4.8, 5, [['1 oz', 28], ['1/4 cup', 34]], ''],
  ['Chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 0, 16, [['1 tbsp', 12], ['2 tbsp', 24]], ''],
  ['Ground flaxseed', 534, 18.3, 28.9, 42.2, 27.3, 1.5, 30, [['1 tbsp', 7], ['2 tbsp', 14]], 'flax linseed'],
  ['Hemp seeds', 553, 31.6, 8.7, 48.8, 4, 1.5, 5, [['3 tbsp', 30]], 'hearts'],
  ['Pumpkin seeds', 559, 30.2, 10.7, 49.1, 6, 1.4, 7, [['1 oz', 28]], 'pepitas'],
  ['Sunflower seeds', 584, 20.8, 20, 51.5, 8.6, 2.6, 9, [['1 oz', 28]], ''],
  ['Hummus', 230, 7.5, 14, 16, 6, 0.3, 430, [['2 tbsp', 28], ['1/4 cup', 60]], 'chickpea dip'],
  ['Black beans, cooked', 132, 8.9, 23.7, 0.5, 8.7, 0.3, 1, [['1/2 cup', 86], ['1 cup', 172]], 'canned'],
  ['Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 7, [['1/2 cup', 82], ['1 cup', 164]], 'garbanzo canned'],
  ['Kidney beans, cooked', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 2, [['1/2 cup', 89], ['1 cup', 177]], 'canned'],
  ['Lentils, cooked', 116, 9, 20.1, 0.4, 7.9, 1.8, 2, [['1/2 cup', 99], ['1 cup', 198]], ''],
  ['Refried beans', 89, 5.4, 14.6, 1.1, 5, 0.5, 440, [['1/2 cup', 120]], 'canned'],
  ['Baked beans', 112, 5, 21, 0.9, 5.5, 8, 420, [['1/2 cup', 127]], 'canned'],

  // Oils, condiments, sauces
  ['Olive oil', 884, 0, 0, 100, 0, 0, 2, [['1 tsp', 4.5], ['1 tbsp', 14]], 'evoo'],
  ['Vegetable oil', 884, 0, 0, 100, 0, 0, 0, [['1 tsp', 4.5], ['1 tbsp', 14]], 'canola avocado'],
  ['Coconut oil', 862, 0, 0, 100, 0, 0, 0, [['1 tbsp', 14]], ''],
  ['Mayonnaise', 680, 1, 0.6, 74.9, 0, 0.6, 635, [['1 tbsp', 14], ['2 tbsp', 28]], 'mayo'],
  ['Ranch dressing', 480, 1.3, 6, 50, 0, 4.6, 900, [['1 tbsp', 15], ['2 tbsp', 30]], 'salad'],
  ['Caesar dressing', 542, 2.2, 3.3, 57.8, 0, 2.8, 1074, [['1 tbsp', 15], ['2 tbsp', 30]], 'salad'],
  ['Vinaigrette', 267, 0.3, 8, 26, 0, 6.5, 640, [['1 tbsp', 15], ['2 tbsp', 30]], 'balsamic italian salad dressing'],
  ['Ketchup', 101, 1, 27.4, 0.1, 0.3, 21.3, 907, [['1 tbsp', 17]], 'catsup'],
  ['Mustard', 60, 3.7, 5.8, 3.3, 3.3, 0.9, 1135, [['1 tsp', 5]], 'dijon yellow'],
  ['BBQ sauce', 172, 0.8, 40.8, 0.6, 0.9, 33.2, 1027, [['2 tbsp', 36]], 'barbecue'],
  ['Sriracha', 93, 1.9, 19.2, 0.9, 2.2, 15, 2124, [['1 tsp', 7]], 'hot sauce'],
  ['Soy sauce', 53, 8.1, 4.9, 0.6, 0.8, 0.4, 5493, [['1 tbsp', 16]], 'tamari'],
  ['Salsa', 29, 1.5, 6.7, 0.2, 1.9, 4, 711, [['2 tbsp', 32], ['1/4 cup', 64]], 'pico'],
  ['Guacamole', 160, 2, 8.6, 14, 6, 0.6, 315, [['2 tbsp', 30], ['1/4 cup', 60]], 'guac'],
  ['Honey', 304, 0.3, 82.4, 0, 0.2, 82.1, 4, [['1 tsp', 7], ['1 tbsp', 21]], ''],
  ['Maple syrup', 260, 0, 67, 0.1, 0, 60.4, 12, [['1 tbsp', 20], ['1/4 cup', 80]], ''],
  ['Sugar, white', 387, 0, 100, 0, 0, 99.8, 1, [['1 tsp', 4], ['1 tbsp', 12]], ''],
  ['Jam', 278, 0.4, 68.9, 0.1, 1.1, 48.5, 32, [['1 tbsp', 20]], 'jelly preserves'],
  ['Chocolate hazelnut spread', 539, 6, 62.4, 31.6, 3.4, 56.3, 41, [['1 tbsp', 19], ['2 tbsp', 37]], 'nutella'],

  // Snacks and treats
  ['Dark chocolate, 70-85%', 598, 7.8, 45.9, 42.6, 10.9, 24, 20, [['1 square', 10], ['1/4 bar', 25]], ''],
  ['Milk chocolate', 535, 7.7, 59.4, 29.7, 3.4, 51.5, 79, [['4 squares', 25], ['1 bar', 43]], ''],
  ['Potato chips', 536, 7, 52.9, 34.6, 4.4, 0.4, 525, [['~15 chips', 28], ['1 small bag', 42]], 'crisps'],
  ['Tortilla chips', 490, 7, 63, 23, 5.3, 0.6, 400, [['~12 chips', 28]], 'nachos'],
  ['Popcorn, air popped', 387, 12.9, 77.8, 4.5, 14.5, 0.9, 8, [['3 cups popped', 24]], ''],
  ['Popcorn, buttered', 535, 8, 56, 30, 10, 0.6, 763, [['3 cups popped', 33]], 'microwave movie'],
  ['Pretzels', 380, 10, 80, 3, 3.4, 2.2, 1240, [['1 oz', 28]], ''],
  ['Cookie, chocolate chip', 488, 5.1, 64.7, 23.4, 2.4, 38, 310, [['1 cookie', 30], ['2 cookies', 60]], ''],
  ['Sandwich cookies', 471, 5, 71, 20, 2.9, 41, 400, [['3 cookies', 34]], 'oreo'],
  ['Donut, glazed', 421, 4.9, 50, 22.8, 1.2, 23, 380, [['1 donut', 52]], 'doughnut'],
  ['Croissant', 406, 8.2, 45.8, 21, 2.6, 11.3, 470, [['1 medium', 57], ['1 large', 72]], ''],
  ['Muffin, blueberry', 377, 5.3, 54, 16, 1.5, 30, 340, [['1 muffin', 110]], 'bakery'],
  ['Brownie', 440, 5, 55, 22, 2, 40, 250, [['1 square', 56]], ''],
  ['Cake with frosting', 390, 3.6, 54.6, 17, 0.8, 42, 310, [['1 slice', 95]], 'birthday'],
  ['Cheesecake', 321, 5.5, 25.5, 22.5, 0.4, 21.7, 438, [['1 slice', 125]], ''],
  ['Apple pie', 237, 2, 34, 11, 1.6, 15.7, 201, [['1 slice', 125]], ''],
  ['Granola bar', 452, 8, 65, 17, 4.5, 25, 180, [['1 bar', 42]], 'nature valley clif'],
  ['Trail mix', 462, 13.8, 44.9, 29.4, 5.9, 27, 118, [['1/4 cup', 37], ['1/2 cup', 74]], ''],

  // Mixed dishes (estimates)
  ['Pizza, cheese', 266, 11, 33, 10, 2.3, 3.6, 598, [['1 slice', 107], ['2 slices', 214], ['3 slices', 321]], 'approx'],
  ['Pizza, pepperoni', 298, 13, 34, 13, 2.3, 3.8, 683, [['1 slice', 111], ['2 slices', 222]], 'approx'],
  ['Cheeseburger, fast food', 263, 15, 28, 11, 1.5, 6, 590, [['1 burger', 114]], 'approx mcdonalds'],
  ['Hamburger, fast food', 250, 13, 31, 9, 1.4, 6, 500, [['1 burger', 100]], 'approx'],
  ['Quarter-pound cheeseburger', 257, 15, 20, 13, 1.5, 5, 560, [['1 burger', 202]], 'approx big mac quarter pounder'],
  ['Chicken nuggets', 258, 15, 16, 16, 1, 0.3, 500, [['4 pieces', 65], ['6 pieces', 97], ['10 pieces', 160]], 'approx tenders'],
  ['Burrito, chicken (restaurant)', 170, 9.5, 21, 5.5, 2.5, 1.2, 420, [['1 burrito', 500], ['1/2 burrito', 250]], 'approx chipotle'],
  ['Burrito bowl, chicken', 120, 9, 13, 3.5, 2.5, 1.2, 320, [['1 bowl', 550]], 'approx chipotle'],
  ['Taco, beef hard shell', 218, 10, 16, 12, 2.5, 1, 410, [['1 taco', 78], ['2 tacos', 156]], 'approx'],
  ['Sushi roll, california', 130, 3.8, 22, 2.5, 1.5, 3.5, 310, [['1 roll (8 pc)', 190], ['4 pieces', 95]], 'approx'],
  ['Sushi roll, salmon', 150, 6, 23, 3, 1.2, 2.8, 290, [['1 roll (8 pc)', 170], ['4 pieces', 85]], 'approx avocado'],
  ['Sandwich, turkey deli', 210, 11, 24, 8, 1.8, 3.5, 640, [['1 sandwich', 230], ['1/2 sandwich', 115]], 'approx sub'],
  ['Grilled cheese sandwich', 350, 12, 33, 19, 1.7, 4, 720, [['1 sandwich', 120]], 'approx'],
  ['Peanut butter and jam sandwich', 340, 11, 42, 14, 3.2, 15, 380, [['1 sandwich', 130]], 'approx pbj pb&j'],
  ['Caesar salad with chicken', 120, 12, 4, 6.5, 1.2, 1.5, 320, [['1 bowl', 350], ['1 side salad', 180]], 'approx'],
  ['Macaroni and cheese', 170, 6.5, 20, 7, 1.1, 3.5, 420, [['1 cup', 198]], 'approx kraft'],
  ['Spaghetti with meat sauce', 132, 6, 17, 4, 2, 3.4, 320, [['1 cup', 250], ['1.5 cups', 375]], 'approx bolognese'],
  ['Fried rice, chicken', 168, 7, 20, 6.5, 1, 1.2, 450, [['1 cup', 198], ['1.5 cups', 297]], 'approx'],
  ['Chicken curry', 120, 9, 6, 7, 1.2, 2.2, 350, [['1 cup', 235]], 'approx'],
  ['Chili with beans', 107, 7, 11, 3.6, 3.7, 1.6, 380, [['1 cup', 256]], 'approx con carne'],
  ['Soup, chicken noodle', 26, 1.6, 3.2, 0.6, 0.3, 0.4, 370, [['1 cup', 245], ['1 can prepared', 490]], 'approx'],
  ['Instant ramen', 447, 9.5, 62, 17.6, 2.1, 1.9, 1855, [['1 package dry', 85], ['1/2 package', 43]], 'noodles'],
  ['Poutine', 185, 5.5, 18, 10, 1.6, 1, 480, [['1 regular', 400], ['1 small', 250]], 'approx fries gravy curds'],
  ['Smoothie, fruit', 60, 1.3, 14, 0.3, 1.2, 10.5, 15, [['16 oz', 450], ['12 oz', 340]], 'approx'],

  // Drinks
  ['Coffee, black', 1, 0.1, 0, 0, 0, 0, 2, [['1 cup (8 oz)', 240], ['grande (16 oz)', 473]], 'americano espresso drip'],
  ['Espresso', 9, 0.1, 1.7, 0.2, 0, 0, 14, [['1 shot', 30], ['2 shots', 60]], ''],
  ['Latte, 2% milk', 42, 2.2, 3.7, 1.5, 0, 3.6, 30, [['12 oz', 355], ['16 oz', 473]], 'coffee'],
  ['Cappuccino, 2% milk', 30, 1.7, 2.7, 1.2, 0, 2.6, 22, [['12 oz', 355]], 'coffee'],
  ['Latte, oat milk', 45, 1, 6, 1.8, 0.6, 2.6, 38, [['12 oz', 355], ['16 oz', 473]], 'coffee'],
  ['Orange juice', 45, 0.7, 10.4, 0.2, 0.2, 8.4, 1, [['1 cup', 248]], 'oj'],
  ['Apple juice', 46, 0.1, 11.3, 0.1, 0.2, 9.6, 4, [['1 cup', 248]], ''],
  ['Soda, cola', 42, 0, 10.6, 0, 0, 10.6, 4, [['1 can (355 ml)', 355], ['1 bottle (591 ml)', 591]], 'coke pepsi pop soft drink'],
  ['Diet soda', 0, 0, 0, 0, 0, 0, 12, [['1 can (355 ml)', 355]], 'coke zero pop'],
  ['Sports drink', 24, 0, 6, 0, 0, 5.5, 39, [['1 bottle (591 ml)', 591]], 'gatorade powerade electrolyte'],
  ['Energy drink', 44, 0, 11, 0, 0, 10.7, 40, [['1 can (250 ml)', 250], ['1 large can (473 ml)', 473]], 'red bull monster'],
  ['Kombucha', 13, 0, 3.3, 0, 0, 2.7, 4, [['1 bottle (480 ml)', 480]], 'alcohol'],
  ['Coconut water', 19, 0.7, 3.7, 0.2, 1.1, 2.6, 105, [['1 bottle (330 ml)', 330]], ''],
  ['Beer', 43, 0.5, 3.6, 0, 0, 0, 4, [['1 can (355 ml)', 355], ['1 pint (473 ml)', 473]], 'alcohol lager ale ipa'],
  ['Beer, light', 29, 0.2, 1.6, 0, 0, 0, 4, [['1 can (355 ml)', 355]], 'alcohol'],
  ['Wine, red', 85, 0.1, 2.6, 0, 0, 0.6, 4, [['1 glass (5 oz)', 148]], 'alcohol'],
  ['Wine, white', 82, 0.1, 2.6, 0, 0, 1, 5, [['1 glass (5 oz)', 148]], 'alcohol'],
  ['Spirits (vodka, whiskey, rum)', 231, 0, 0, 0, 0, 0, 1, [['1 shot (1.5 oz)', 42]], 'alcohol gin tequila'],
];

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const GENERIC_FOODS = R.map(([name, kcal, p, c, f, fiber, sugar, sodium, servings, kws]) => ({
  id: 'g-' + slug(name),
  source: 'generic',
  name,
  brand: null,
  per100: { kcal, p, c, f, fiber, sugar, sodium },
  servings: servings.map(([label, g]) => ({ label, g })),
  kws: kws || '',
}));

// Local instant search over generic + user foods.
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function searchFoods(foods, query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const res = terms.map(t => new RegExp(`(?:^|[^a-z0-9])${escRe(t)}`));
  const scored = [];
  for (const f of foods) {
    const name = f.name.toLowerCase();
    const hay = `${name} ${(f.brand || '').toLowerCase()} ${f.kws || ''}`;
    let ok = true, score = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      // short terms must match at a word boundary; longer terms may match mid-word
      if (t.length <= 2 ? !res[i].test(hay) : !hay.includes(t)) { ok = false; break; }
      if (name.startsWith(t)) score += 6;
      else if (res[i].test(name)) score += 4;
      else if (name.includes(t)) score += 2;
      else score += 1;
    }
    if (!ok) continue;
    if (name === q) score += 10;
    score += Math.min(3, (f.useCount || 0));
    if (f.favorite) score += 2;
    if (f.source === 'custom') score += 1;
    scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length);
  return scored.slice(0, limit).map(s => s.f);
}
