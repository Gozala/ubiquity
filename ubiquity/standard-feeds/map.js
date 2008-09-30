CmdUtils.CreateCommand({
  name: "map",
  takes: {"address": noun_arb_text},
  icon: "chrome://ubiquity/skin/icons/map.png",
  description: "Turns an address or location name into a Google Map.",
  help:"Try issuing &quot;map kalamazoo&quot;.  You can click on the map in the preview pane to get a" +
       " larger, interactive map that you can zoom and pan around.  You can then click the &quot;insert map in page&quot;" +
       " (if you're in an editable text area) to insert the map.  So you can, for example, type an address in an email, " +
       " select it, issue &quot;map&quot;, click on the preview, and then insert the map.",
  execute: function( directObj ) {
    var location = directObj.text;
    var url = "http://maps.google.com/?q=";
    url += encodeURIComponent(location);

    Utils.openUrlInBrowser( url );
  },
  preview: function(pblock, directObj) {
    var location = directObj.text;
    CmdUtils.showPreviewFromFile( pblock,
                                  "templates/map.html",
                                  function(winInsecure) {
      winInsecure.setPreview( location );

      winInsecure.insertHtml = function(html) {
        var doc = context.focusedWindow.document;
        var focused = context.focusedElement;

        // This would be nice to store the map in the buffer...
	// But for now, it causes a problem with a large image showing up as the default
        //CmdUtils.setLastResult( html );

        if (doc.designMode == "on") {
          doc.execCommand("insertHTML", false, location + "<br/>" + html);
        }
        else if (CmdUtils.getSelection()) {
	        CmdUtils.setSelection(html);
      	}
      	else {
      	  displayMessage("Cannot insert in a non-editable space. Use 'edit page' for an editable page.");
      	}
      };
    });
  }
});


CmdUtils.CreateCommand({
  name:"map-these",
  takes: {"selection": noun_arb_text },
  icon : "chrome://ubiquity/skin/icons/map_add.png",
  description: "Maps multiple selected addresses or links onto a single Google Map. (Experimental!)",
  preview: function( pblock, directObject ) {
    var html = directObject.html;
    pblock.innerHTML = "<span id='loading'>Mapping...</span>";

    // TODO: Figure out why we have to do this?
    var doc = context.focusedWindow.document;
    var div = doc.createElement( "div" );
    div.innerHTML = html;

    var pages = {};

    jQuery( "a", div ).each( function() {
      if( this.href.indexOf(".html") != -1 ) {
        pages[ jQuery(this).text() ] = this.href;
      }
    });

    var mapUrl = "http://maps.google.com/staticmap?";

    var params = {
      size: "500x300",
      key: "ABQIAAAAGZ11mh1LzgQ8-8LRW3wEShQeSuJunOpTb3RsLsk00-MAdzxmXhQoiCd940lo0KlfQM5PeNYEPLW-3w",
      markers: ""
    };

    var mapURL = mapUrl + jQuery.param( params );
    var img = doc.createElement( "img" );
    img.src = mapURL;
    jQuery(pblock).height( 300 )
                  .append( img )
                  .append( "<div id='spots'></div>");

    var markerNumber = 97; // Lowercase a

    for( var description in pages ) {
      jQuery.get( pages[description], function(pageHtml) {
        var div = doc.createElement( "div" );
        div.innerHTML = pageHtml;

        // Get the link entitled "Google Map" and then strip out
        // the location from it's href, which is always of the form
        // http://map.google.com?q=loc%3A+[location], where [location]
        // is the location string with spaces replaced by pluses.
        var mapLink = jQuery( "a:contains(google map)", div );
        if( mapLink.length > 0 ) {
          mapLink = mapLink[0];
          var loc = mapLink.href.match( /\?q=loc%3A\+(.*)/ )[1]
                                .replace( /\+/g, " ");
          CmdUtils.geocodeAddress( loc, function(points){
            if( points != null){
              jQuery( "#loading:visible", pblock).slideUp();

              var params = {
                lat: points[0].lat,
                "long": points[0].long,
                marker: String.fromCharCode( markerNumber++ ),
                name: jQuery( "title", div).text()
              };

              img.src += CmdUtils.renderTemplate( "${lat},${long},red${marker}|", params );

              params.marker = params.marker.toUpperCase();
              var spotName = CmdUtils.renderTemplate( "<div><b>${marker}</b>: <i>${name}</i></div>", params );
              jQuery( "#spots", pblock ).append( spotName );
              jQuery( pblock ).animate( {height: "+=6px"} );
            }
          });
        }
      });
    }

  }
});
