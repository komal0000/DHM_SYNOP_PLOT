import './res/js/stationmodel_draw_fcns.js';

var canvas, stage;
var station, wind_barb, sky, temp, dewpt, pres, pres_box;
var dpres, dpres_box, temp_box, dewpt_box, p_trend, p_trend_box;
var vis, vis_box, vis_whole, vis_num, vis_denom, vis_line, weather;
var weather_image = new Image();

function createStationModel() {
    canvas = document.getElementById("canvas");
    stage = new createjs.Stage(canvas);
    stage.autoClear = true;

    station = new createjs.Shape();
    wind_barb = new createjs.Shape();
    sky = new createjs.Shape();
    pres = new createjs.Text("000", "bold 24px Arial");
    pres_box = new createjs.Shape();
    dpres = new createjs.Text("0000", "bold 22px Arial");
    dpres_box = new createjs.Shape();
    temp = new createjs.Text("0000", "bold 24px Arial");
    temp_box = new createjs.Shape();
    dewpt = new createjs.Text("0000", "bold 24px Arial");
    dewpt_box = new createjs.Shape();
    weather = new createjs.Bitmap("weather_symbols.gif");
    p_trend = new createjs.Bitmap("p_trends.gif");

    vis = new createjs.Container();
    vis_box = new createjs.Shape();
    vis_whole = new createjs.Text("00", "bold 24px Arial");
    vis_num = new createjs.Text("0", "bold 20px Arial");
    vis_denom = new createjs.Text("00", "bold 20px Arial");
    vis_line = new createjs.Shape();
    vis.addChild(vis_num);
    vis.addChild(vis_denom);
    vis.addChild(vis_line);
    vis.addChild(vis_whole);

    document.getElementById("temperature").value = 72;
    document.getElementById("dewpoint").value = 63;
    document.getElementById("pressure").value = 1004.6;
    document.getElementById("pres_3hr").value = 2.3;
    document.getElementById("w_speed").value = 25;
    document.getElementById("w_dir").value = 180;
    document.getElementById("visibility").value = 1;
    document.getElementById("sky_cover").selectedIndex = 6;
    document.getElementById("visibility_frac").selectedIndex = 1;
    document.getElementById("weather").selectedIndex = 4;

    station.graphics.ss(3).s("#000").f("rgba(255,255,255,1)").dc(0, 0, 25);
    station.x = canvas.width >> 1;
    station.y = canvas.height >> 1;

    draw_wind(wind_barb);
    wind_barb.x = canvas.width >> 1;
    wind_barb.y = canvas.height >> 1;

    draw_weather(weather, document.getElementById("weather").selectedIndex);
    weather.x = station.x - 70;
    weather.y = station.y - 16;

    draw_sky(sky, document.getElementById("sky_cover").selectedIndex);
    sky.x = canvas.width >> 1;
    sky.y = canvas.height >> 1;

    draw_P(pres);
    pres.x = station.x + 25;
    pres.y = station.y - 50;
    pres_box.graphics.f("rgba(255,255,255,1)").dr(pres.x, pres.y, 40, 22);

    draw_dp(dpres, p_trend)
    dpres.x = station.x + 38;
    dpres.y = station.y - 10;
    dpres_box.graphics.f("rgba(255,255,255,1)").dr(dpres.x - 2, dpres.y, 40, 22);
    p_trend.x = station.x + 75;
    p_trend.y = station.y - 10;

    draw_T_Td(temp, dewpt);
    temp.x = station.x - 65;
    temp.y = station.y - 50;
    temp_box.graphics.f("rgba(255,255,255,1)").dr(temp.x, temp.y, 45, 22);
    dewpt.x = station.x - 65;
    dewpt.y = station.y + 35;
    dewpt_box.graphics.f("rgba(255,255,255,1)").dr(dewpt.x, dewpt.y, 45, 22);

    vis_whole.name = "vis_whole";
    vis_whole.textAlign = "end";
    vis_num.name = "vis_num";
    vis_num.textAlign = "center";
    vis_denom.name = "vis_denom";
    vis_denom.textAlign = "center";
    vis_line.name = "vis_line";
    vis_num.x = vis_whole.x + 14;
    vis_num.y = vis_whole.y - 10;
    vis_denom.x = vis_whole.x + 15;
    vis_denom.y = vis_whole.y + 10;
    vis_line.graphics.ss(2).s("#000").mt(5, 9).lt(25, 9);
    vis.x = station.x - 95;
    vis.y = station.y - 11;
    draw_vis(vis, 1);
    vis_box.graphics.f("rgba(255,255,255,1)").dr(vis.x - 13, vis.y, 45, 22);

    document.getElementById("message").innerHTML = "Enter the observation data on the right to see the corresponding station model.";

    stage.addChild(wind_barb);
    stage.addChild(vis_box);
    stage.addChild(vis);
    stage.addChild(weather);
    stage.addChild(pres_box);
    stage.addChild(pres);
    stage.addChild(dpres_box);
    stage.addChild(dpres);
    stage.addChild(p_trend);
    stage.addChild(temp_box);
    stage.addChild(temp);
    stage.addChild(dewpt_box);
    stage.addChild(dewpt);
    stage.addChild(station);
    stage.addChild(sky);

    stage.update();

}

function checkInput(obj, what_chars) {
    var invalidChars;
    if (what_chars == "#") {
        invalidChars = /[^0-9]/gi;
    } else if (what_chars == "#.") {
        invalidChars = /[^0-9\\.]/gi;
    } else if (what_chars == "#-") {
        invalidChars = /[^0-9\-]/gi;
    } else if (what_chars == "#-.") {
        invalidChars = /[^0-9\-\\.]/gi;
    }

    if (invalidChars.test(obj.value)) {
        obj.value = obj.value.replace(invalidChars, "");
    } else {
        if (obj.id == "temperature" || obj.id == "dewpoint") {
            draw_T_Td(temp, dewpt);
        } else if (obj.id == "pressure" || obj.id == "pres_3hr") {
            draw_P(pres);
            draw_dp(dpres, p_trend);
        } else if (obj.id == "w_speed" || obj.id == "w_dir") {
            draw_wind(wind_barb);
        } else if (obj.id == "visibility") {
            draw_vis(vis, document.getElementById("visibility_frac").selectedIndex);
        }
        stage.update();
    }

}

function combo_change(obj) {
    var state = obj.selectedIndex;
    if (obj.id == "sky_cover") {
        draw_sky(sky, state);
    } else if (obj.id == "visibility_frac") {
        draw_vis(vis, state);
    } else if (obj.id == "weather") {
        draw_weather(weather, state);
    } else if (obj.id == "prestrend") {
        var offset;
        if (dpres.text < 0) {
            offset = 100;
        } else {
            offset = 40;
        }
        p_trend.sourceRect = new createjs.Rectangle(obj.selectedIndex * 20 + offset, 0, 20, 20);
    }
    stage.update();
}
