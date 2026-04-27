const express = require('express');
const app = express();

app.get('/', (req, res) => {
    const name = test();
    res.send('Server live');
    name;
    sum(3, 5);
});

app.listen(3000, () => {
    console.log('Server live at  3000 port');
});

function test() {
    return console.log('Test function called');
}

