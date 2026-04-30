const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Server live');

});

app.listen(3000, () => {
    console.log('Server live at  3000 port');

});


